import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SceneGraph, Clip, Asset } from '@/types';

export interface EditorState {
  activeProjectId: string | null;
  sceneGraph: SceneGraph | null;
  assets: Asset[];
  playhead: number;
  selectedClipId: string | null;
  isExporting: boolean;
  exportProgress: number;
  exportUrl: string | null;
  isPlaying: boolean;
}

const initialState: EditorState = {
  activeProjectId: null,
  sceneGraph: null,
  assets: [],
  playhead: 0,
  selectedClipId: null,
  isExporting: false,
  exportProgress: 0,
  exportUrl: null,
  isPlaying: false,
};

const recalculateDuration = (state: EditorState) => {
  if (!state.sceneGraph) return;
  let maxEndTime = 0; // Minimum duration is 0
  for (const track of state.sceneGraph.tracks) {
    for (const clip of track.clips) {
      if (clip.endTime > maxEndTime) {
        maxEndTime = clip.endTime;
      }
    }
  }
  // Exact duration based on clips
  state.sceneGraph.duration = maxEndTime;
};

const editorSlice = createSlice({
  name: 'editor',
  initialState,
  reducers: {
    setPlayhead: (state, action: PayloadAction<number>) => {
      state.playhead = action.payload;
    },
    togglePlay: (state) => {
      state.isPlaying = !state.isPlaying;
    },
    setAssets: (state, action: PayloadAction<Asset[]>) => {
      state.assets = action.payload;
    },
    setProject: (state, action: PayloadAction<{ projectId: string, sceneGraph: SceneGraph }>) => {
      state.activeProjectId = action.payload.projectId;
      state.sceneGraph = action.payload.sceneGraph;
      recalculateDuration(state);
    },
    setSelectedClip: (state, action: PayloadAction<string | null>) => {
      state.selectedClipId = action.payload;
    },
    addAssetToTimeline: (state, action: PayloadAction<{ asset: Asset, trackId: string, startTime: number }>) => {
      if (!state.sceneGraph) return;

      const { asset, trackId, startTime } = action.payload;

      const newClip: Clip = {
        id: `clip_${Date.now()}`,
        assetId: asset._id,
        asset: asset,
        startTime: startTime,
        endTime: startTime + asset.duration,
        trimIn: 0,
        trimOut: asset.duration,
      };

      const trackIndex = state.sceneGraph.tracks.findIndex(t => t.id === trackId);
      if (trackIndex === -1) {
        state.sceneGraph.tracks.push({
          id: trackId,
          type: asset.type === 'audio' ? 'audio' : 'video',
          clips: [newClip]
        });
      } else {
        const track = state.sceneGraph.tracks[trackIndex];
        
        // Collision detection for insertion
        let finalStartTime = startTime;
        let finalEndTime = newClip.endTime;
        
        // Simple strategy: push to the end if there's any overlap at all
        const hasOverlap = track.clips.some(c => 
          (finalStartTime >= c.startTime && finalStartTime < c.endTime) ||
          (finalEndTime > c.startTime && finalEndTime <= c.endTime) ||
          (finalStartTime <= c.startTime && finalEndTime >= c.endTime)
        );

        if (hasOverlap) {
          // Find the maximum end time on this track
          const maxEndTime = track.clips.reduce((max, c) => Math.max(max, c.endTime), 0);
          finalStartTime = maxEndTime;
          finalEndTime = finalStartTime + asset.duration;
          newClip.startTime = finalStartTime;
          newClip.endTime = finalEndTime;
        }

        track.clips.push(newClip);
      }

      recalculateDuration(state);
    },
    updateClip: (state, action: PayloadAction<{ trackId: string, clipId: string, updates: Partial<Clip> }>) => {
      if (!state.sceneGraph) return;
      const { trackId, clipId, updates } = action.payload;

      const track = state.sceneGraph.tracks.find(t => t.id === trackId);
      if (track) {
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) {
          Object.assign(clip, updates);
          recalculateDuration(state);
        }
      }
    },
    splitClip: (state, action: PayloadAction<{ trackId: string, clipId: string, splitAtTime: number }>) => {
      if (!state.sceneGraph) return;
      const { trackId, clipId, splitAtTime } = action.payload;

      const track = state.sceneGraph.tracks.find(t => t.id === trackId);
      if (!track) return;

      const clipIndex = track.clips.findIndex(c => c.id === clipId);
      if (clipIndex === -1) return;

      const originalClip = track.clips[clipIndex];
      
      // Don't split if time is outside clip bounds
      if (splitAtTime <= originalClip.startTime || splitAtTime >= originalClip.endTime) return;

      // Calculate the offset into the asset
      const splitOffset = splitAtTime - originalClip.startTime;

      // Create new clip B
      const newClip: Clip = {
        ...originalClip,
        id: `clip_${Date.now()}`,
        startTime: splitAtTime,
        trimIn: originalClip.trimIn + splitOffset,
      };

      // Update original clip (becomes Clip A)
      originalClip.endTime = splitAtTime;
      originalClip.trimOut = originalClip.trimIn + splitOffset;

      // Insert new clip right after original clip
      track.clips.splice(clipIndex + 1, 0, newClip);
      recalculateDuration(state);
    },
    deleteClip: (state, action: PayloadAction<string>) => {
      if (!state.sceneGraph) return;
      const clipId = action.payload;
      for (const track of state.sceneGraph.tracks) {
        const index = track.clips.findIndex(c => c.id === clipId);
        if (index !== -1) {
          track.clips.splice(index, 1);
          if (state.selectedClipId === clipId) {
            state.selectedClipId = null;
          }
          break;
        }
      }
      recalculateDuration(state);
    },
    moveClip: (state, action: PayloadAction<{ clipId: string, newStartTime: number, newTrackId?: string }>) => {
      if (!state.sceneGraph) return;
      const { clipId, newStartTime, newTrackId } = action.payload;
      
      let targetClip: Clip | null = null;
      let sourceTrack: any = null;
      let sourceTrackIndex = -1;

      for (let i = 0; i < state.sceneGraph.tracks.length; i++) {
        const track = state.sceneGraph.tracks[i];
        const clipIndex = track.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
          targetClip = track.clips[clipIndex];
          sourceTrack = track;
          sourceTrackIndex = i;
          break;
        }
      }

      if (targetClip && sourceTrack) {
        const duration = targetClip.endTime - targetClip.startTime;
        let proposedStart = Math.max(0, newStartTime);
        let proposedEnd = proposedStart + duration;

        // Determine destination track
        let destTrack = sourceTrack;
        if (newTrackId && newTrackId !== sourceTrack.id) {
          const foundDestTrack = state.sceneGraph.tracks.find(t => t.id === newTrackId);
          if (foundDestTrack) {
            destTrack = foundDestTrack;
          }
        }

        // Collision Detection against other clips on the destination track
        let hasCollision = false;
        for (const otherClip of destTrack.clips) {
          if (otherClip.id === clipId) continue;

          // Check if proposed time intersects with otherClip
          if (
            (proposedStart >= otherClip.startTime && proposedStart < otherClip.endTime) ||
            (proposedEnd > otherClip.startTime && proposedEnd <= otherClip.endTime) ||
            (proposedStart <= otherClip.startTime && proposedEnd >= otherClip.endTime)
          ) {
            hasCollision = true;
            break;
          }
        }

        if (!hasCollision) {
          // If track changed, move it
          if (destTrack.id !== sourceTrack.id) {
            const clipIndex = sourceTrack.clips.findIndex((c: Clip) => c.id === clipId);
            if (clipIndex !== -1) {
              const [clipToMove] = sourceTrack.clips.splice(clipIndex, 1);
              clipToMove.startTime = proposedStart;
              clipToMove.endTime = proposedEnd;
              destTrack.clips.push(clipToMove);
            }
          } else {
             // Same track movement
            targetClip.startTime = proposedStart;
            targetClip.endTime = proposedEnd;
          }
          
          recalculateDuration(state);
        }
      }
    },
    setExporting: (state, action: PayloadAction<boolean>) => {
      state.isExporting = action.payload;
      if (action.payload) {
        state.exportProgress = 0;
        state.exportUrl = null;
      }
    },
    setExportProgress: (state, action: PayloadAction<number>) => {
      state.exportProgress = action.payload;
    },
    setExportUrl: (state, action: PayloadAction<string | null>) => {
      state.exportUrl = action.payload;
    }
  },
});

export const { 
  setProject, setAssets, addAssetToTimeline, 
  updateClip, splitClip, deleteClip, 
  moveClip, setPlayhead, setSelectedClip,
  setExporting, setExportProgress, setExportUrl, togglePlay
} = editorSlice.actions;

export default editorSlice.reducer;
