export interface LyricLine {
  time: number; // in seconds
  text: string;
  duration: number; // duration of the line in seconds
}

export interface SongMetadata {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  coverUrl?: string;
  fileUrl: string;
  fileName: string;
}

export enum PlaybackState {
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED'
}

export interface AudioVisualizerData {
  frequencyData: Uint8Array;
}