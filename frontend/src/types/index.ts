export interface Asset {
  _id: string;
  original_url: string;
  preview_url: string;
  thumbnail_sprite_url?: string;
  duration: number;
  type: 'video' | 'audio' | 'image' | 'text';
  content?: string; // Used for text elements
  public_id: string;
}

export interface Keyframe {
  t: number;
  scale?: number;
  x?: number;
  y?: number;
}

export interface Effect {
  type: string;
  duration?: number;
  params?: Record<string, any>;
}

export interface Clip {
  id: string;
  assetId: string;
  asset: Asset; // Reference to the full asset details
  startTime: number; // Position on timeline
  endTime: number;   // End position on timeline
  trimIn: number;    // Start of the video file to use
  trimOut: number;   // End of the video file to use
  effects?: Effect[];
  keyframes?: Keyframe[];
}

export interface Track {
  id: string;
  type: 'video' | 'audio' | 'text';
  clips: Clip[];
}

export interface SceneGraph {
  projectId: string;
  duration: number;
  fps: number;
  resolution: { w: number; h: number };
  tracks: Track[];
}

export interface Project {
  _id: string;
  title: string;
  duration: number;
  fps: number;
  thumbnail_url?: string;
  resolution: { w: number; h: number };
}
