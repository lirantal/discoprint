import { TypeSafeClient, choice, score, noul } from "@typesafe-ai/sdk";
import type { SongClassification } from "./types.js";

let client: TypeSafeClient | undefined;
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient();
  return client;
}

const THEME_CRITERIA = {
  love: "Romantic love, desire, or devotion",
  heartbreak: "Breakup, longing, or lost love",
  party_fun: "Partying, dancing, or having a good time",
  money_success: "Wealth, fame, ambition, or success",
  social_political: "Social commentary, injustice, or politics",
  loss_grief: "Death, mourning, or grief",
  self_reflection: "Introspection, identity, or personal growth",
  other: "Doesn't clearly fit the above categories",
};

const MOOD_CRITERIA = [
  "Very dark, sad, or despairing",
  "Melancholic or downbeat",
  "Neutral or mixed emotional tone",
  "Positive or hopeful",
  "Joyful, euphoric, or triumphant",
] as const;

const COMPLEXITY_CRITERIA = [
  "Very simple and repetitive language",
  "Straightforward, plain language",
  "Some figurative language or wordplay",
  "Rich in metaphor, imagery, or literary technique",
] as const;

function questionsFor(lyrics: string) {
  return {
    theme: choice("What is the primary theme of these song lyrics?", THEME_CRITERIA),
    mood: score("How positive or upbeat is the emotional tone of these lyrics?", MOOD_CRITERIA),
    complexity: score("How lyrically dense or literary is the language in these lyrics?", COMPLEXITY_CRITERIA),
    explicit: noul("These lyrics contain profanity or explicit sexual content.", {
      true: "Contains swearing or explicit content",
      false: "Clean lyrics",
    }),
    firstPerson: noul(
      "These lyrics are narrated from a personal, first-person perspective about the singer's own experience.",
    ),
  };
}

export async function classifySong(params: {
  artist: string;
  track: string;
  album: string;
  releaseDate?: string;
  lyrics: string;
  lyricsSource: SongClassification["lyricsSource"];
}): Promise<SongClassification> {
  const response = await getClient().systemOne({
    state: { artist: params.artist, track: params.track, lyrics: params.lyrics },
    questions: questionsFor(params.lyrics),
  });

  const { theme, mood, complexity, explicit, firstPerson } = response.answers;

  return {
    artist: params.artist,
    track: params.track,
    album: params.album,
    releaseDate: params.releaseDate,
    lyricsSource: params.lyricsSource,
    theme: theme.choice,
    themeConfidence: theme.confidence,
    mood: mood.score,
    moodConfidence: mood.confidence,
    complexity: complexity.score,
    complexityConfidence: complexity.confidence,
    explicit: explicit.noul,
    firstPerson: firstPerson.noul,
  };
}
