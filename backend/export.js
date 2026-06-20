import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

ffmpeg.setFfmpegPath(ffmpegStatic);
ffmpeg.setFfprobePath(ffprobeStatic.path);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const probeHasAudio = (url) => new Promise((resolve) => {
  ffmpeg.ffprobe(url, (err, metadata) => {
    if (err) {
      console.error("FFPROBE Error on URL:", url, err.message);
      resolve(false);
    } else if (!metadata || !metadata.streams) {
      resolve(false);
    } else {
      resolve(metadata.streams.some(s => s.codec_type === 'audio'));
    }
  });
});

const WEIGHTS = {
  image: 1.0,
  audio: 1.2,
  text: 1.5,
  textAnim: 2.5,
  layout: 2.0,
  video: 4.0
};

const RESOLUTION_MULTIPLIERS = {
  '480p': 0.5,
  '720p': 1.0,
  '1080p': 1.8,
  '4k': 4.0
};

// Calculate Total Project TCU
function calculateTotalProjectWorkload(sceneGraph) {
  if (!sceneGraph || !sceneGraph.tracks) return 0;
  
  let totalTCU = 0;
  
  // Resolve resolution from sceneGraph
  let resKey = '720p';
  if (sceneGraph.resolution) {
    const width = sceneGraph.resolution.w;
    const height = sceneGraph.resolution.h;
    if (width >= 3840 || height >= 2160) resKey = '4k';
    else if (width >= 1920 || height >= 1080) resKey = '1080p';
    else if (width >= 1280 || height >= 720) resKey = '720p';
    else resKey = '480p';
  }
  const resMult = RESOLUTION_MULTIPLIERS[resKey] || 1.0;

  sceneGraph.tracks.forEach(track => {
    const clips = track.clips || [];
    clips.forEach(clip => {
      // Determine asset type
      const type = clip.asset && clip.asset.type ? clip.asset.type : (track.type || 'video');
      const baseWeight = WEIGHTS[type] ?? WEIGHTS.image;
      
      const duration = (clip.trimOut - clip.trimIn) || (clip.endTime - clip.startTime) || 0;
      const multiplier = type === 'video' ? resMult : 1.0;
      
      totalTCU += duration * baseWeight * multiplier;
    });
  });
  
  return totalTCU;
}

// Scoped Render Session Factory
function createRenderSession(totalTCU) {
  return {
    totalTCU,
    processedTCU: 0,
    smoothedSpeed: null,
    renderStartTime: Date.now(),
    lastUpdateTime: Date.now(),
    warmupMs: 5000,
    alpha: 0.3
  };
}

// Parse HH:MM:SS.ms string into seconds
function parseTimemark(timemark) {
  if (!timemark) return 0;
  const parts = timemark.split(':');
  if (parts.length !== 3) return 0;
  const hours = parseFloat(parts[0]) || 0;
  const minutes = parseFloat(parts[1]) || 0;
  const seconds = parseFloat(parts[2]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

// Calculate processed TCU up to chronological time `t`
function calculateProcessedTCU(sceneGraph, t) {
  if (!sceneGraph || !sceneGraph.tracks) return 0;
  
  let processed = 0;
  
  let resKey = '720p';
  if (sceneGraph.resolution) {
    const width = sceneGraph.resolution.w;
    const height = sceneGraph.resolution.h;
    if (width >= 3840 || height >= 2160) resKey = '4k';
    else if (width >= 1920 || height >= 1080) resKey = '1080p';
    else if (width >= 1280 || height >= 720) resKey = '720p';
    else resKey = '480p';
  }
  const resMult = RESOLUTION_MULTIPLIERS[resKey] || 1.0;

  sceneGraph.tracks.forEach(track => {
    const clips = track.clips || [];
    clips.forEach(clip => {
      const type = clip.asset && clip.asset.type ? clip.asset.type : (track.type || 'video');
      const baseWeight = WEIGHTS[type] ?? WEIGHTS.image;
      const multiplier = type === 'video' ? resMult : 1.0;
      
      const clipStart = clip.startTime || 0;
      const clipEnd = clip.endTime || 0;
      
      // Calculate how much of this clip has been processed chronologically at render head `t`
      const activeDuration = Math.max(0, Math.min(t - clipStart, clipEnd - clipStart));
      
      processed += activeDuration * baseWeight * multiplier;
    });
  });
  
  return processed;
}

export const handleExport = async (req, res) => {
  try {
    const { sceneGraph } = req.body;
    
    // DEBUG: dump to file
    fs.writeFileSync(path.join(__dirname, 'last_export.json'), JSON.stringify(sceneGraph, null, 2));

    if (!sceneGraph || !sceneGraph.tracks || sceneGraph.tracks.length === 0) {
      return res.status(400).json({ error: 'Empty scene graph' });
    }

    // Gather all clips across all tracks and separate them based on their asset type
    const allClipsInProject = [];
    sceneGraph.tracks.forEach(track => {
      if (track.clips) {
        allClipsInProject.push(...track.clips);
      }
    });

    const mainClips = allClipsInProject.filter(clip => {
      const type = clip.asset?.type || 'video';
      return (type === 'video' || type === 'image') && (clip.asset?.preview_url || clip.asset?.original_url);
    }).sort((a, b) => a.startTime - b.startTime);

    const audioClips = allClipsInProject.filter(clip => {
      const type = clip.asset?.type;
      return type === 'audio' && (clip.asset?.preview_url || clip.asset?.original_url);
    }).sort((a, b) => a.startTime - b.startTime);


    if (mainClips.length === 0) {
      return res.status(400).json({ error: 'No video clips to export' });
    }

    const outputPath = path.join(__dirname, 'uploads', `export_${Date.now()}.mp4`);
    
    if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
      fs.mkdirSync(path.join(__dirname, 'uploads'));
    }

    const allClips = [...mainClips, ...audioClips];
    
    // We must probe every clip because if a video has no audio stream, referencing [X:a] causes FFmpeg to crash
    const hasAudioFlags = await Promise.all(
      allClips.map(clip => probeHasAudio(clip.asset.preview_url || clip.asset.original_url))
    );

    const command = ffmpeg();
    allClips.forEach(clip => {
      command.input(clip.asset.preview_url || clip.asset.original_url);
    });

    let filter = '';

    // 1. Process Main Video Track (Concat Video + Audio)
    if (mainClips.length === 1) {
      const clip = mainClips[0];
      filter += `[0:v]trim=start=${Math.max(0, clip.trimIn)}:end=${Math.max(0, clip.trimOut)},setpts=PTS-STARTPTS,scale=1280:720,setsar=1,fps=30,format=yuv420p[outv]; `;
      if (hasAudioFlags[0]) {
        filter += `[0:a]atrim=start=${Math.max(0, clip.trimIn)}:end=${Math.max(0, clip.trimOut)},asetpts=PTS-STARTPTS[main_a]; `;
      } else {
        const duration = Math.max(0.1, clip.trimOut - clip.trimIn);
        filter += `anullsrc=r=44100:cl=stereo:d=${duration}[main_a]; `;
      }
    } else {
      mainClips.forEach((clip, index) => {
        filter += `[${index}:v]trim=start=${Math.max(0, clip.trimIn)}:end=${Math.max(0, clip.trimOut)},setpts=PTS-STARTPTS,scale=1280:720,setsar=1,fps=30,format=yuv420p[v${index}]; `;
        if (hasAudioFlags[index]) {
          filter += `[${index}:a]atrim=start=${Math.max(0, clip.trimIn)}:end=${Math.max(0, clip.trimOut)},asetpts=PTS-STARTPTS[a${index}]; `;
        } else {
          const duration = Math.max(0.1, clip.trimOut - clip.trimIn);
          filter += `anullsrc=r=44100:cl=stereo:d=${duration}[a${index}]; `;
        }
      });

      const concatInputs = mainClips.map((_, i) => `[v${i}][a${i}]`).join('');
      filter += `${concatInputs}concat=n=${mainClips.length}:v=1:a=1[outv][main_a]; `;
    }

    // 2. Process Audio Track (Delay and Mix)
    let mixAudioInputs = '[main_a]';
    let numAudioInputs = 1;

    audioClips.forEach((clip, i) => {
      const index = mainClips.length + i;
      if (!hasAudioFlags[index]) return; // Skip silent audio track files completely

      const delayMs = Math.floor(clip.startTime * 1000);
      filter += `[${index}:a]atrim=start=${Math.max(0, clip.trimIn)}:end=${Math.max(0, clip.trimOut)},asetpts=PTS-STARTPTS,adelay=delays=${delayMs}:all=1[aud${i}]; `;
      mixAudioInputs += `[aud${i}]`;
      numAudioInputs++;
    });

    if (numAudioInputs > 1) {
      filter += `${mixAudioInputs}amix=inputs=${numAudioInputs}:duration=first:dropout_transition=2:normalize=0[outa]`;
      command.complexFilter(filter, ['outv', 'outa']);
    } else {
      command.complexFilter(filter, ['outv', 'main_a']);
    }

    command.videoCodec('libx264')
           .audioCodec('aac')
           .outputOptions(['-shortest']);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const totalTCU = calculateTotalProjectWorkload(sceneGraph);
    const session = createRenderSession(totalTCU);

    command.on('progress', (progress) => {
      const currentTime = Date.now();
      const elapsedMs = currentTime - session.renderStartTime;
      const batchDurationSeconds = (currentTime - session.lastUpdateTime) / 1000;
      session.lastUpdateTime = currentTime;

      // 1. Determine render position `t` (current timeline duration processed)
      let t = 0;
      if (progress.timemark) {
        t = parseTimemark(progress.timemark);
      } else if (progress.percent && sceneGraph.duration) {
        t = sceneGraph.duration * (progress.percent / 100);
      }
      
      // 2. Calculate current processed TCU
      const currentProcessedTCU = calculateProcessedTCU(sceneGraph, t);
      const unitsCompletedInBatch = Math.max(0, currentProcessedTCU - session.processedTCU);
      session.processedTCU = Math.min(session.totalTCU, currentProcessedTCU);

      // 3. Compute progress percentage based on TCU
      const progressPercent = session.totalTCU > 0 
        ? (session.processedTCU / session.totalTCU) * 100 
        : (progress.percent || 0);
      const percent = Math.min(99, Math.max(0, Math.round(progressPercent)));

      // 4. Warm-up Phase Guard
      if (elapsedMs < session.warmupMs) {
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          percent, 
          etaSeconds: null, 
          status: 'preparing' 
        })}\n\n`);
        return;
      }

      // 5. Compute Instantaneous Batch Speed (TCU / sec)
      const batchSpeed = batchDurationSeconds > 0 
        ? unitsCompletedInBatch / batchDurationSeconds 
        : 0;

      // 6. Smooth with Exponential Weighted Moving Average (EWMA)
      if (session.smoothedSpeed === null) {
        session.smoothedSpeed = batchSpeed > 0 ? batchSpeed : 1.0; 
      } else {
        session.smoothedSpeed = (session.alpha * batchSpeed) + ((1 - session.alpha) * session.smoothedSpeed);
      }

      // 7. Calculate ETA
      const remainingTCU = Math.max(0, session.totalTCU - session.processedTCU);
      let etaSeconds = null;
      if (session.smoothedSpeed > 0.001) {
        etaSeconds = Math.ceil(remainingTCU / session.smoothedSpeed);
      }

      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        percent, 
        etaSeconds, 
        status: 'rendering' 
      })}\n\n`);
    });

    command.on('end', () => {
      const filename = path.basename(outputPath);
      res.write(`data: ${JSON.stringify({ type: 'complete', url: `http://localhost:3000/uploads/${filename}` })}\n\n`);
      res.end();
    });

    command.on('error', (err, stdout, stderr) => {
      console.error('Export error:', err);
      console.error('FFmpeg stderr:', stderr);
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message + ' | stderr: ' + (stderr || '').slice(-200) })}\n\n`);
      res.end();
    });

    command.save(outputPath);

  } catch (error) {
    console.error('Export handler error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed' });
    }
  }
};
