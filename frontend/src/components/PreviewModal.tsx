import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { setPlayhead, togglePlay } from '@/store/editorSlice';
import { store } from '@/store';
import type { Clip } from '@/types';

export function PreviewModal({ onClose }: { onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { sceneGraph, playhead, isPlaying } = useAppSelector(state => state.editor);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  // Cache for images
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

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
          video.muted = false; // We want audio in preview
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

  // Main render loop
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const { playhead: currentPlayhead, isPlaying: currentIsPlaying, sceneGraph: currentSceneGraph } = store.getState().editor;
      if (!currentSceneGraph) return;

      // Clear background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Find active clips
      const activeClips: Clip[] = [];
      for (const track of currentSceneGraph.tracks) {
        const clip = track.clips.find(c => currentPlayhead >= c.startTime && currentPlayhead <= c.endTime);
        if (clip) {
          activeClips.push(clip);
        }
      }

      // Sync and draw active clips from bottom to top
      [...activeClips].reverse().forEach(clip => {
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

            if (clip.asset.type === 'video' && video.readyState >= 2) {
              // Basic scale to fit keeping aspect ratio
              const scale = Math.min(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
              const w = video.videoWidth * scale;
              const h = video.videoHeight * scale;
              const x = (canvas.width - w) / 2;
              const y = (canvas.height - h) / 2;
              ctx.drawImage(video, x, y, w, h);
            }
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
          ctx.fillStyle = '#ffffff'; 
          ctx.font = 'bold 72px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(clip.asset.content || '', canvas.width / 2, canvas.height / 2);
        }
      });

      // Pause inactive videos/audio
      for (const [id, video] of videoRefs.current.entries()) {
        const isActive = activeClips.some(c => c.assetId === id);
        if (!isActive && !video.paused) {
          video.pause();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => cancelAnimationFrame(animationFrameId);
  }, [dispatch]);

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex flex-col">
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-6 bg-gradient-to-b from-black/50 to-transparent">
        <h2 className="text-white font-medium">Project Preview</h2>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Main Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <canvas 
          ref={canvasRef}
          width={1920}
          height={1080}
          className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-black"
        />
      </div>

      {/* Controls */}
      <div className="h-24 flex flex-col items-center justify-center gap-4 bg-gradient-to-t from-black/50 to-transparent pb-6">
        <div className="text-white font-mono text-xl tracking-wider">
           {Math.floor(playhead / 60)}:{(playhead % 60).toFixed(1).padStart(4, '0')}
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => dispatch(setPlayhead(0))}
            className="text-white hover:text-blue-400 transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
          </button>
          
          <button 
            onClick={() => dispatch(togglePlay())}
            className="w-14 h-14 bg-white hover:bg-slate-200 text-black rounded-full flex items-center justify-center transition-transform hover:scale-105"
          >
            {isPlaying ? (
               <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            ) : (
               <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="ml-1"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
