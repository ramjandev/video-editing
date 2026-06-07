import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setPlayhead, togglePlay } from '@/store/editorSlice';
import { store } from '@/store';
import type { Clip } from '@/types';

export function Player() {
  const dispatch = useAppDispatch();
  const { sceneGraph, playhead, isPlaying } = useAppSelector(state => state.editor);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reqRef = useRef<number>(0);
  
  // Cache for images to avoid reloading
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Setup hidden video elements for videos and audio
  useEffect(() => {
    if (!sceneGraph) return;

    sceneGraph.tracks.forEach(track => {
      track.clips.forEach(clip => {
        if ((clip.asset.type === 'video' || clip.asset.type === 'audio') && !videoRefs.current.has(clip.assetId)) {
          const video = document.createElement('video');
          video.src = clip.asset.preview_url;
          video.crossOrigin = 'anonymous';
          video.preload = 'auto';
          video.muted = false; // We want audio in player
          videoRefs.current.set(clip.assetId, video);
        }
      });
    });

    return () => {
      videoRefs.current.forEach(video => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
      videoRefs.current.clear();
    };
  }, [sceneGraph]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const render = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;

      // Read directly from Redux store to avoid React render cycle race conditions
      const { playhead: currentPlayhead, isPlaying: currentIsPlaying, sceneGraph: currentSceneGraph } = store.getState().editor;
      
      if (!currentSceneGraph) {
        reqRef.current = requestAnimationFrame(render);
        return;
      }

      const duration = currentSceneGraph.duration || 0;

      // Find active clips across all tracks
      const activeClips: Clip[] = [];
      for (const track of currentSceneGraph.tracks) {
        const clip = track.clips.find(c => currentPlayhead >= c.startTime && currentPlayhead <= c.endTime);
        if (clip) {
          activeClips.push(clip);
        }
      }

      // Sync and play active audio/video media
      activeClips.forEach(clip => {
        if (clip.asset.type === 'video' || clip.asset.type === 'audio') {
          const video = videoRefs.current.get(clip.assetId);
          if (video) {
            const currentClipTime = clip.trimIn + (currentPlayhead - clip.startTime);
            if (Math.abs(video.currentTime - currentClipTime) > 0.1) {
              video.currentTime = currentClipTime;
            }
            if (currentIsPlaying && video.paused) {
              video.play().catch(() => {});
            } else if (!currentIsPlaying && !video.paused) {
              video.pause();
            }
          }
        }
      });

      // Pause inactive videos/audio
      for (const [id, video] of videoRefs.current.entries()) {
        const isActive = activeClips.some(c => c.assetId === id);
        if (!isActive && !video.paused) {
          video.pause();
        }
      }

      // Find the first active video for decoding visually (MVP limitation: 1 video drawn at a time)
      const currentVideoClip = activeClips.find(c => c.asset.type === 'video');
      const video = currentVideoClip ? videoRefs.current.get(currentVideoClip.assetId) : null;

      // Clear canvas with light background
      ctx.fillStyle = '#f8fafc'; // slate-50
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render all active clips from bottom track to top track
      [...activeClips].reverse().forEach(clip => {
        if (clip.asset.type === 'audio') return; // Don't draw audio visually

        if (clip.asset.type === 'video' && clip.id === currentVideoClip?.id && video) {
          try {
            if (video.readyState >= 2) {
              const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
              const w = video.videoWidth * scale;
              const h = video.videoHeight * scale;
              const x = (canvas.width - w) / 2;
              const y = (canvas.height - h) / 2;
              ctx.drawImage(video, x, y, w, h);
            } else {
              ctx.fillStyle = '#e2e8f0'; // slate-200
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#64748b'; // slate-500
              ctx.font = '16px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('Loading video...', canvas.width/2, canvas.height/2);
            }
          } catch (e) {
            console.error("Failed to draw video frame", e);
          }
        } else if (clip.asset.type === 'image') {
          // Render image
          let img = imageCache.current[clip.asset.preview_url];
          if (!img) {
            img = new Image();
            img.crossOrigin = "anonymous";
            img.src = clip.asset.preview_url;
            imageCache.current[clip.asset.preview_url] = img;
          }
          if (img.complete) {
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            const x = (canvas.width - w) / 2;
            const y = (canvas.height - h) / 2;
            ctx.drawImage(img, x, y, w, h);
          }
        } else if (clip.asset.type === 'text') {
          // Render text centered for MVP
          ctx.fillStyle = '#0f172a'; // slate-900 (black text)
          ctx.font = 'bold 48px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(clip.asset.content || '', canvas.width / 2, canvas.height / 2);
        }
      });

      // Debug overlay
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(10, 10, 160, 30);
      ctx.fillStyle = '#334155';
      ctx.font = '14px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(`${formatTime(currentPlayhead)} | ${activeClips.length} layers`, 15, 30);

      // Advance playhead if playing using precise delta time
      if (currentIsPlaying) {
        const newPlayhead = currentPlayhead + delta;
        if (newPlayhead >= duration) {
          dispatch(togglePlay());
          dispatch(setPlayhead(0));
        } else {
          dispatch(setPlayhead(newPlayhead));
        }
      }

      reqRef.current = requestAnimationFrame(render);
    };

    reqRef.current = requestAnimationFrame(render);

    return () => cancelAnimationFrame(reqRef.current);
  }, [dispatch]);

  return (
    <div className="flex flex-col h-full w-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
      <div className="relative flex-1 bg-slate-100 flex items-center justify-center overflow-hidden">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={450} 
          className="max-w-full max-h-full object-contain aspect-video bg-white shadow-sm border border-slate-200"
        />
      </div>
      
      <div className="h-14 bg-white border-t border-slate-200 flex items-center justify-center gap-6">
        <button 
          onClick={() => dispatch(setPlayhead(0))}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
        </button>
        <button 
          onClick={() => dispatch(togglePlay())}
          className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 p-2 rounded-full transition-colors"
        >
          {isPlaying ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          )}
        </button>
        <div className="text-slate-500 font-medium text-sm w-24 text-center">
          {formatTime(playhead)} <span className="text-slate-300">|</span> {formatTime(sceneGraph?.duration || 0)}
        </div>
      </div>
    </div>
  );
}
