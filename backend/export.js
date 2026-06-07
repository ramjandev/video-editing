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

export const handleExport = async (req, res) => {
  try {
    const { sceneGraph } = req.body;
    
    // DEBUG: dump to file
    fs.writeFileSync(path.join(__dirname, 'last_export.json'), JSON.stringify(sceneGraph, null, 2));

    if (!sceneGraph || !sceneGraph.tracks || sceneGraph.tracks.length === 0) {
      return res.status(400).json({ error: 'Empty scene graph' });
    }

    // Find tracks robustly even if the type field is corrupted
    const audioTrack = sceneGraph.tracks.find(t => t.type === 'audio' || t.id.includes('audio') || (t.clips.length > 0 && t.clips[0].asset.type === 'audio'));
    const mainTrack = sceneGraph.tracks.find(t => t !== audioTrack && (t.type === 'video' || (t.clips.length > 0 && t.clips[0].asset.type === 'video'))) || sceneGraph.tracks[0];
    
    const mainClips = mainTrack && mainTrack !== audioTrack ? mainTrack.clips.sort((a, b) => a.startTime - b.startTime) : [];
    const audioClips = audioTrack ? audioTrack.clips : [];

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

    command.on('progress', (progress) => {
      const percent = Math.min(99, Math.max(0, Math.round(progress.percent || 50)));
      res.write(`data: ${JSON.stringify({ type: 'progress', percent })}\n\n`);
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
