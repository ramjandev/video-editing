import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { splitClip, setSelectedClip, deleteClip, moveClip, setPlayhead, addAssetToTimeline } from '@/store/editorSlice';
import { triggerAutosave } from '@/store/thunks';
import type { Clip } from '@/types';

const pixelsPerSecond = 20;

// Extracted to prevent 60fps re-renders of the main timeline
function PlayheadIndicator() {
  const playhead = useAppSelector(state => state.editor.playhead);
  const dispatch = useAppDispatch();

  return (
    <div 
      className="absolute top-0 bottom-0 w-[2px] bg-slate-700 z-50 pointer-events-none transition-none ml-20"
      style={{ left: `${playhead * pixelsPerSecond}px` }}
    >
      <svg 
        width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg"
        className="absolute top-[14px] -ml-[6px] cursor-ew-resize pointer-events-auto drop-shadow-md"
        onMouseDown={(e) => {
          e.stopPropagation();
          // We can dispatch a drag state if needed, but simple scrubbing logic:
          const onMouseMove = (moveEvent: MouseEvent) => {
            const container = document.getElementById('timeline-scroll-container');
            if (container) {
              const rect = container.getBoundingClientRect();
              let newX = moveEvent.clientX - rect.left + container.scrollLeft - 80;
              newX = Math.max(0, newX);
              dispatch(setPlayhead(newX / pixelsPerSecond));
            }
          };
          const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
          };
          window.addEventListener('mousemove', onMouseMove);
          window.addEventListener('mouseup', onMouseUp);
        }}
      >
        <path d="M 3 2 C 2.45 2 2 2.45 2 3 L 2 11 L 7 16 L 12 11 L 12 3 C 12 2.45 11.55 2 11 2 Z" fill="white" stroke="#334155" strokeWidth="2.5" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// Extracted AutoScroller
function AutoScroller({ scrollContainerRef }: { scrollContainerRef: React.RefObject<HTMLDivElement | null> }) {
  const playhead = useAppSelector(state => state.editor.playhead);
  const isPlaying = useAppSelector(state => state.editor.isPlaying);

  useEffect(() => {
    if (isPlaying && scrollContainerRef.current) {
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      const clientWidth = scrollContainerRef.current.clientWidth;
      const playheadX = playhead * pixelsPerSecond;
      
      if (playheadX > scrollLeft + clientWidth * 0.8) {
        scrollContainerRef.current.scrollLeft = playheadX - clientWidth * 0.2;
      }
      if (playheadX < scrollLeft + clientWidth * 0.2) {
        scrollContainerRef.current.scrollLeft = Math.max(0, playheadX - clientWidth * 0.2);
      }
    }
  }, [playhead, isPlaying, scrollContainerRef]);

  return null;
}

// Extracted Header for Split button
function TimelineHeader() {
  const dispatch = useAppDispatch();
  const sceneGraph = useAppSelector(state => state.editor.sceneGraph);
  const playhead = useAppSelector(state => state.editor.playhead);
  const selectedClipId = useAppSelector(state => state.editor.selectedClipId);

  // Check if we can split: either a selected clip is under playhead, or ANY clip is under playhead
  let canSplit = false;
  if (sceneGraph) {
    for (const track of sceneGraph.tracks) {
      for (const clip of track.clips) {
        if (playhead > clip.startTime && playhead < clip.endTime) {
          if (selectedClipId) {
            if (clip.id === selectedClipId) {
              canSplit = true;
              break;
            }
          } else {
            canSplit = true;
            break;
          }
        }
      }
    }
  }

  const handleSplit = () => {
    if (!sceneGraph) return;
    
    let clipsToSplit: { trackId: string, clipId: string }[] = [];
    
    // If a clip is selected, only split that one (if it's under playhead)
    if (selectedClipId) {
      for (const track of sceneGraph.tracks) {
        const clip = track.clips.find(c => c.id === selectedClipId && playhead > c.startTime && playhead < c.endTime);
        if (clip) {
          clipsToSplit.push({ trackId: track.id, clipId: clip.id });
          break;
        }
      }
    } else {
      // Otherwise split ALL clips under playhead
      for (const track of sceneGraph.tracks) {
        const clip = track.clips.find(c => playhead > c.startTime && playhead < c.endTime);
        if (clip) {
          clipsToSplit.push({ trackId: track.id, clipId: clip.id });
        }
      }
    }

    clipsToSplit.forEach(({ trackId, clipId }) => {
      dispatch(splitClip({ trackId, clipId, splitAtTime: playhead }));
    });
    
    if (clipsToSplit.length > 0) {
      dispatch(triggerAutosave());
    }
  };

  return (
    <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center px-4 justify-between shrink-0 z-40 relative">
      <div className="text-slate-600 text-xs font-semibold uppercase tracking-wider">Timeline</div>
      <div className="flex gap-2">
        <button 
          onClick={handleSplit}
          disabled={!canSplit}
          className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-white text-slate-700 rounded text-xs flex items-center gap-1 transition-colors shadow-sm"
          title={selectedClipId ? "Split selected clip" : "Split all clips at playhead"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          Split
        </button>
      </div>
    </div>
  );
}

export function Timeline() {
  const dispatch = useAppDispatch();
  const sceneGraph = useAppSelector(state => state.editor.sceneGraph);
  const selectedClipId = useAppSelector(state => state.editor.selectedClipId);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [dragState, setDragState] = useState<{ clipId: string, startX: number, startY: number, originalStartTime: number, originalTrackId: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedClipId) {
        dispatch(deleteClip(selectedClipId));
        dispatch(triggerAutosave());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedClipId, dispatch]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (dragState && containerRef.current && sceneGraph) {
        const deltaX = e.clientX - dragState.startX;
        const deltaSeconds = deltaX / pixelsPerSecond;
        const newStartTime = dragState.originalStartTime + deltaSeconds;
        
        const rect = containerRef.current.getBoundingClientRect();
        let trackIndex = Math.floor((e.clientY - rect.top - 72) / 80);
        trackIndex = Math.max(0, Math.min(trackIndex, sceneGraph.tracks.length - 1));
        const newTrackId = sceneGraph.tracks[trackIndex].id;

        dispatch(moveClip({ clipId: dragState.clipId, newStartTime, newTrackId }));
      }
    };

    const handleMouseUp = () => {
      if (dragState) {
        setDragState(null);
        dispatch(triggerAutosave());
      }
    };

    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, dispatch, sceneGraph]);

  if (!sceneGraph) return <div className="h-full bg-slate-900 p-4 text-slate-400">No project loaded</div>;

  const duration = sceneGraph.duration || 0;

  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip, trackId: string) => {
    e.stopPropagation();
    dispatch(setSelectedClip(clip.id));
    setDragState({
      clipId: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      originalStartTime: clip.startTime,
      originalTrackId: trackId
    });
  };

  const handleTimelineMouseDown = () => {
    dispatch(setSelectedClip(null));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current || !sceneGraph) return;

    try {
      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;
      
      const data = JSON.parse(rawData);
      if (data.type === 'asset' && data.asset) {
        const scrollRect = scrollContainerRef.current?.getBoundingClientRect();
        if (!scrollRect) return;

        let dropX = e.clientX - scrollRect.left + (scrollContainerRef.current?.scrollLeft || 0) - 80;
        dropX = Math.max(0, dropX);
        const startTime = dropX / pixelsPerSecond;

        let trackIndex = Math.floor((e.clientY - scrollRect.top + (scrollContainerRef.current?.scrollTop || 0) - 32) / 80);
        let trackId = '';

        if (trackIndex >= 0 && trackIndex < sceneGraph.tracks.length) {
          trackId = sceneGraph.tracks[trackIndex].id;
        } else {
          trackId = `track_${Date.now()}`;
        }

        dispatch(addAssetToTimeline({ asset: data.asset, trackId, startTime }));
        dispatch(triggerAutosave());
      }
    } catch (err) {
      console.error("Failed to parse dropped asset data", err);
    }
  };

  const visualDuration = Math.max(30, Math.ceil(duration + 10));

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      className="flex flex-col h-full bg-white text-sm overflow-hidden relative"
      onMouseDown={handleTimelineMouseDown}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      ref={containerRef}
    >
      <TimelineHeader />
      
      <div id="timeline-scroll-container" className="flex-1 overflow-auto flex flex-col relative" ref={scrollContainerRef}>
        <AutoScroller scrollContainerRef={scrollContainerRef} />
        
        {/* Ruler Container (Sticky Top) */}
        <div className="sticky top-0 z-30 h-8 bg-white border-b border-slate-200 shrink-0 flex w-max min-w-full">
          {/* Top-left empty sticky corner */}
          <div className="w-20 shrink-0 bg-slate-50 sticky left-0 z-40 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></div>
          
          {/* The actual ruler */}
          <div className="flex-1 relative bg-white">
            {Array.from({ length: visualDuration }).map((_, i) => {
              const time = i;
              const isMajor = time % 4 === 0;
              
              return (
                <div 
                  key={i} 
                  className={`absolute bottom-0 border-l ${isMajor ? 'border-slate-400 h-3' : 'border-slate-200 h-1.5'}`}
                  style={{ left: `${time * pixelsPerSecond}px` }}
                >
                  {isMajor && (
                    <span className="absolute -top-4 -left-4 text-[10px] text-slate-500 font-medium select-none w-8 text-center">
                      {formatTime(time)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tracks container */}
        <div className="flex-1 relative pb-20 w-max min-w-full">
          {sceneGraph.tracks.map((track) => (
            <div key={track.id} className="flex h-20 border-b border-slate-200 relative hover:bg-slate-50 transition-colors">
              {/* Track Header (Sticky Left) */}
              <div className="w-20 bg-white flex items-center justify-center border-r border-slate-200 shrink-0 text-slate-500 z-20 sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                 {track.type === 'video' ? (
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                 ) : track.type === 'audio' ? (
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                 ) : (
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                 )}
              </div>
              
              {/* Track Content */}
              <div className="flex-1 relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wMikiLz48L3N2Zz4=')]">
                {track.clips.map((clip) => {
                  const isSelected = selectedClipId === clip.id;
                  const isAudio = clip.asset.type === 'audio';
                  const isText = clip.asset.type === 'text';
                  
                  let clipBg = "bg-blue-100 border-blue-300 text-blue-800";
                  if (isAudio) clipBg = "bg-green-100 border-green-300 text-green-800";
                  if (isText) clipBg = "bg-purple-100 border-purple-300 text-purple-800";

                  return (
                    <div 
                      key={clip.id}
                      className={`absolute top-2 bottom-2 ${clipBg} rounded-md border ${isSelected ? 'ring-2 ring-blue-500 shadow-md z-10' : 'shadow-sm'} overflow-hidden cursor-grab active:cursor-grabbing hover:brightness-95 flex items-center px-2.5 text-[11px] select-none transition-all group`}
                      style={{
                        left: `${clip.startTime * pixelsPerSecond}px`,
                        width: `${(clip.endTime - clip.startTime) * pixelsPerSecond}px`
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip, track.id)}
                      title={`Start: ${formatTime(clip.startTime)}, End: ${formatTime(clip.endTime)}`}
                    >
                      <span className="truncate w-full block font-medium">
                        {isText ? clip.asset.content : clip.asset.original_url.split('/').pop()}
                      </span>
                      
                      {/* Delete Clip Button */}
                      <button 
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-slate-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch(deleteClip(clip.id));
                          dispatch(triggerAutosave());
                        }}
                        title="Remove from timeline"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Empty area to drop new tracks */}
          <div className="h-16 flex items-center justify-center text-slate-400 italic border-2 border-dashed border-slate-200 m-4 rounded-lg text-xs ml-24 bg-white/50 w-[800px] max-w-full">
            Drag assets here to create a new track
          </div>
        </div>

        <PlayheadIndicator />
      </div>
    </div>
  );
}
