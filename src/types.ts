export interface Track {
  /** MusicBrainz recording id */
  mbid: string;
  title: string;
  normalizedTitle: string;
  album: string;
  releaseDate?: string;
}

export interface LyricsResult {
  plainLyrics: string | null;
  source: "lrclib-get" | "lrclib-search" | "none";
}

export interface SongClassification {
  artist: string;
  track: string;
  album: string;
  releaseDate?: string;
  lyricsSource: LyricsResult["source"];
  theme: string;
  themeConfidence: number;
  mood: number;
  moodConfidence: number;
  complexity: number;
  complexityConfidence: number;
  explicit: number;
  firstPerson: number;
}
