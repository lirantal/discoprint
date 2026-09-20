// Standalone UI spike — NOT wired into the real pipeline. Simulated song
// data, no network calls, no Jev/MusicBrainz/lrclib involved. The point is
// only to validate whether an Ink-based two-panel "live classifying" layout
// (inspired by a Snake-playing-AI demo shared for reference — see
// spikes/README.md) feels better than the current single-column terminal
// checklist in src/viz/render-terminal.ts + src/spinner.ts.
//
// Run: pnpm run spike:ink
import React, { useEffect, useState } from "react";
import { Box, render, Text, useApp, useInput } from "ink";
import { themeColor } from "../src/viz/theme-palette.js";

interface FakeSong {
  title: string;
  theme: string;
  mood: number; // 0..4
  complexity: number; // 0..3
  explicit: number; // 0..1
  firstPerson: number; // 0..1
  themeConfidence: number; // 0..1
}

// Loosely modeled on real classify output from this session (Bon Jovi/Madonna
// runs) so the numbers read as plausible, not random noise.
const SONGS: FakeSong[] = [
  { title: "Lucky Star", theme: "love", mood: 2.9, complexity: 1, explicit: 0.02, firstPerson: 0.82, themeConfidence: 0.91 },
  { title: "Borderline", theme: "love", mood: 1.0, complexity: 1, explicit: 0.01, firstPerson: 0.74, themeConfidence: 0.88 },
  { title: "Burning Up", theme: "love", mood: 2.3, complexity: 2, explicit: 0.03, firstPerson: 0.9, themeConfidence: 0.93 },
  { title: "Holiday", theme: "party_fun", mood: 3.9, complexity: 1, explicit: 0.01, firstPerson: 0.4, themeConfidence: 0.95 },
  { title: "I Know It", theme: "heartbreak", mood: 0.8, complexity: 1, explicit: 0.02, firstPerson: 0.68, themeConfidence: 0.79 },
  { title: "Think of Me", theme: "self_reflection", mood: 1.4, complexity: 2, explicit: 0.0, firstPerson: 0.85, themeConfidence: 0.71 },
  { title: "Physical Attraction", theme: "love", mood: 2.1, complexity: 1, explicit: 0.12, firstPerson: 0.6, themeConfidence: 0.86 },
  { title: "Everybody", theme: "party_fun", mood: 3.5, complexity: 1, explicit: 0.0, firstPerson: 0.3, themeConfidence: 0.9 },
  { title: "Runaway", theme: "social_political", mood: 0.7, complexity: 3, explicit: 0.04, firstPerson: 0.2, themeConfidence: 0.65 },
  { title: "Roulette", theme: "love", mood: 0.8, complexity: 2, explicit: 0.06, firstPerson: 0.55, themeConfidence: 0.77 },
];

const BAR_WIDTH = 18;
const FILL_STEP = 0.14;
const FILL_TICK_MS = 45;
const PAUSE_AFTER_FILL_MS = 300;

function block(filledWidth: number, width: number): string {
  const clamped = Math.max(0, Math.min(width, filledWidth));
  return `${"█".repeat(clamped)}${"░".repeat(width - clamped)}`;
}

function StatBar({ label, value, max, progress, color }: { label: string; value: number; max: number; progress: number; color: string }) {
  const shown = value * progress;
  const filled = Math.round((shown / max) * BAR_WIDTH);
  return (
    <Box>
      <Box width={13}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text color={color}>{block(filled, BAR_WIDTH)}</Text>
      <Text dimColor> {shown.toFixed(2)}</Text>
    </Box>
  );
}

function App() {
  const { exit } = useApp();
  const [completed, setCompleted] = useState<FakeSong[]>([]);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [tokensIn, setTokensIn] = useState(0);
  const [tokensOut, setTokensOut] = useState(0);

  useInput((input) => {
    if (input === "q") exit();
  });

  const currentIndex = completed.length;
  const current = SONGS[currentIndex];

  // Wall clock, purely cosmetic here (real elapsed time of the demo itself).
  useEffect(() => {
    const startedAt = Date.now();
    const clock = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!current) {
      const done = setTimeout(() => exit(), 1200);
      return () => clearTimeout(done);
    }

    setProgress(0);
    const fill = setInterval(() => {
      setProgress((p) => {
        const next = p + FILL_STEP;
        if (next >= 1) {
          clearInterval(fill);
          setTimeout(() => {
            setTokensIn((t) => t + Math.round(280 + Math.random() * 420));
            setTokensOut((t) => t + Math.round(35 + Math.random() * 55));
            setCompleted((c) => [...c, current]);
          }, PAUSE_AFTER_FILL_MS);
          return 1;
        }
        return next;
      });
    }, FILL_TICK_MS);
    return () => clearInterval(fill);
    // Deliberately keyed on currentIndex alone: it re-runs each time a new song starts.
  }, [currentIndex]);

  const estimatedCostUsd = (tokensIn / 1_000_000) * 0.042;

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold>discoprint / ink spike</Text>
        <Text dimColor>SIMULATED DATA · not wired to the real pipeline</Text>
      </Box>

      <Box>
        <Box borderStyle="round" borderColor="gray" flexDirection="column" width={54} marginRight={1} paddingX={1}>
          <Text bold>SONGS</Text>
          {completed.length === 0 && <Text dimColor>...</Text>}
          {completed.map((song, i) => {
            const { hex } = themeColor(song.theme);
            const title = song.title.length > 34 ? `${song.title.slice(0, 33)}…` : song.title.padEnd(34);
            return (
              <Text key={`${song.title}-${i}`}>
                <Text color={hex}>██</Text> {title} <Text dimColor>mood {song.mood.toFixed(1)}</Text>
              </Text>
            );
          })}
          {current && (
            <Text dimColor>
              {"⠋"} {current.title} <Text dimColor>(classifying…)</Text>
            </Text>
          )}
        </Box>

        <Box borderStyle="round" borderColor="cyan" flexDirection="column" width={44} paddingX={1}>
          <Text bold>{current ? "CLASSIFYING" : "DONE"}</Text>
          <Text>{current ? current.title : `${completed.length} songs classified`}</Text>
          <Box marginTop={1} flexDirection="column">
            {current && (
              <>
                <Box>
                  <Box width={13}>
                    <Text dimColor>theme</Text>
                  </Box>
                  <Text color={themeColor(current.theme).hex}>{themeColor(current.theme).label}</Text>
                  <Text dimColor> {(current.themeConfidence * progress).toFixed(2)}</Text>
                </Box>
                <StatBar label="mood" value={current.mood} max={4} progress={progress} color="#22c55e" />
                <StatBar label="complexity" value={current.complexity} max={3} progress={progress} color="#a78bfa" />
                <StatBar label="explicit" value={current.explicit} max={1} progress={progress} color="#f87171" />
                <StatBar label="first person" value={current.firstPerson} max={1} progress={progress} color="#60a5fa" />
              </>
            )}
          </Box>
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor>
          {completed.length}/{SONGS.length} classified · {(elapsedMs / 1000).toFixed(1)}s elapsed
        </Text>
        <Text dimColor>
          {tokensIn} in / {tokensOut} out tok · ~${estimatedCostUsd.toFixed(4)}
        </Text>
        <Text dimColor>q quit</Text>
      </Box>
    </Box>
  );
}

render(<App />);
