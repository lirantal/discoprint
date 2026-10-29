import type { JevUsage, SongClassification } from "../types.js";

/** A song whose classification has landed — the view-model the log/spotlight render from. */
export interface CompletedSong {
  id: string;
  title: string;
  album: string;
  releaseDate?: string;
  classification: SongClassification;
  usage: JevUsage;
}
