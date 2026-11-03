"use client";

// All sound is synthesized with Web Audio: no audio files to download, nothing to license.
// Browsers keep audio locked until the first tap or key press, so the context resumes on that.

import { useEffect, useSyncExternalStore } from "react";

const PREF_KEY = "qk:sound";

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = true;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  try {
    enabled = localStorage.getItem(PREF_KEY) !== "off";
  } catch {}
  const unlock = () => {
    if (ctx?.state === "suspended") ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { capture: true });
  window.addEventListener("keydown", unlock, { capture: true });
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name: string) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name)!;
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
const f = (name: string) => hz(midi(name));

type ToneOpts = { type?: OscillatorType; vol?: number; slide?: number; release?: number; dest?: AudioNode };

function tone(freq: number, t: number, dur: number, o: ToneOpts = {}) {
  const ac = ctx!;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  const vol = o.vol ?? 0.2;
  const release = o.release ?? 0.08;
  osc.type = o.type ?? "triangle";
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.setValueAtTime(vol, t + Math.max(0.01, dur - 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
  osc.connect(g).connect(o.dest ?? out!);
  osc.start(t);
  osc.stop(t + dur + release + 0.02);
}

function noise(t: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, dest?: AudioNode, sweepTo?: number) {
  const ac = ctx!;
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ac.createBufferSource();
  const bq = ac.createBiquadFilter();
  const g = ac.createGain();
  src.buffer = noiseBuf;
  bq.type = filter;
  bq.frequency.setValueAtTime(freq, t);
  if (sweepTo) bq.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(bq).connect(g).connect(dest ?? out!);
  src.start(t);
  src.stop(t + dur + 0.02);
}

const kick = (t: number, dest?: AudioNode, vol = 0.55) => tone(150, t, 0.11, { type: "sine", vol, slide: 42, release: 0.04, dest });
const hat = (t: number, dest?: AudioNode) => noise(t, 0.035, 0.07, "highpass", 7000, dest);
const clap = (t: number, dest?: AudioNode) => noise(t, 0.12, 0.2, "bandpass", 1600, dest);

const arp = (notes: string[], t: number, gap: number, o: ToneOpts & { dur?: number } = {}) =>
  notes.forEach((n, i) => tone(f(n), t + i * gap, o.dur ?? gap, o));

// ---------- sound effects ----------

const SFX = {
  tap: (t: number) => tone(f("C6"), t, 0.04, { type: "sine", vol: 0.16, slide: f("G6") }),
  pop: (t: number) => tone(420, t, 0.09, { type: "sine", vol: 0.28, slide: 1100, release: 0.04 }),
  correct: (t: number) => {
    arp(["C5", "E5", "G5"], t, 0.075, { vol: 0.22 });
    tone(f("C6"), t + 0.225, 0.3, { vol: 0.22, release: 0.3 });
    tone(f("E7"), t + 0.3, 0.05, { type: "sine", vol: 0.06, release: 0.25 });
    tone(f("G7"), t + 0.36, 0.05, { type: "sine", vol: 0.05, release: 0.25 });
  },
  // Soft and a little silly, never a harsh buzzer: getting it wrong is part of learning.
  wrong: (t: number) => {
    tone(f("E4"), t, 0.16, { vol: 0.2, slide: f("D4") });
    tone(f("C4"), t + 0.2, 0.34, { vol: 0.2, slide: f("A3"), release: 0.15 });
  },
  none: (t: number) => tone(f("G4"), t, 0.25, { type: "sine", vol: 0.15, slide: f("D4"), release: 0.2 }),
  streak: (t: number) => {
    arp(["G5", "B5", "D6", "G6", "B6"], t, 0.055, { type: "square", vol: 0.06 });
    tone(f("D7"), t + 0.3, 0.4, { type: "sine", vol: 0.08, release: 0.4 });
    noise(t, 0.45, 0.08, "bandpass", 2000, undefined, 9000);
  },
  tick: (t: number) => tone(1500, t, 0.02, { type: "square", vol: 0.07, release: 0.03 }),
  up: (t: number) => arp(["E5", "A5"], t, 0.09, { type: "sine", vol: 0.18 }),
  reveal: (t: number) => {
    kick(t, undefined, 0.4);
    tone(f("G4"), t, 0.09, { type: "square", vol: 0.07 });
    [f("C5"), f("E5"), f("G5"), f("C6")].forEach((fr) => tone(fr, t + 0.14, 0.5, { type: "square", vol: 0.05, release: 0.35 }));
  },
  whoosh: (t: number) => noise(t, 0.4, 0.18, "bandpass", 350, undefined, 3500),
  fanfare: (t: number) => {
    const o = { type: "square" as const, vol: 0.07 };
    tone(f("G4"), t, 0.11, o);
    tone(f("C5"), t + 0.13, 0.11, o);
    tone(f("E5"), t + 0.26, 0.11, o);
    tone(f("G5"), t + 0.39, 0.3, o);
    tone(f("E5"), t + 0.72, 0.12, o);
    [f("G5"), f("C6"), f("E5")].forEach((fr) => tone(fr, t + 0.86, 0.75, { ...o, vol: 0.06, release: 0.5 }));
    [0, 0.39, 0.86].forEach((d) => kick(t + d));
    noise(t + 0.86, 1.2, 0.07, "highpass", 6000);
  },
};
export type SfxName = keyof typeof SFX;

export function sfx(name: SfxName, delay = 0) {
  const ac = audio();
  if (!ac) return;
  SFX[name](ac.currentTime + 0.01 + delay);
}

// ---------- background music ----------

// A step sequencer over 16th notes. In a pattern, a note name starts a note, "-" holds it, "." is a rest.
type Voice = { steps: ({ freq: number; len: number } | null)[]; play: (t: number, freq: number, dur: number, bus: AudioNode) => void };
type Track = { bpm: number; voices: Voice[]; drums: { steps: boolean[]; play: (t: number, bus: AudioNode) => void }[]; length: number };

function voice(pattern: string, play: Voice["play"]): Voice {
  const tokens = pattern.trim().split(/\s+/);
  const steps: Voice["steps"] = tokens.map(() => null);
  tokens.forEach((tok, i) => {
    if (tok === "." || tok === "-") return;
    let len = 1;
    while (tokens[i + len] === "-") len++;
    steps[i] = { freq: f(tok), len };
  });
  return { steps, play };
}
const beat = (pattern: string, play: (t: number, bus: AudioNode) => void) => ({
  steps: pattern.replace(/\s+/g, "").split("").map((c) => c === "x"),
  play,
});
function track(bpm: number, voices: Voice[], drums: Track["drums"]): Track {
  return { bpm, voices, drums, length: voices[0].steps.length };
}

const lead = (vol: number): Voice["play"] => (t, fr, dur, bus) => tone(fr, t, dur * 0.85, { type: "square", vol, dest: bus });
const pluck = (vol: number): Voice["play"] => (t, fr, dur, bus) => tone(fr, t, Math.min(dur, 0.09), { type: "sine", vol, release: 0.12, dest: bus });
const bass: Voice["play"] = (t, fr, dur, bus) => tone(fr, t, dur * 0.7, { type: "triangle", vol: 0.32, dest: bus });

// Original tunes. "lobby" is bouncy and friendly, "think" keeps a light pulse under a question,
// "party" is a brighter march for the podium.
const TRACKS = {
  lobby: track(
    112,
    [
      voice(
        `C5 . E5 . G5 . E5 . A5 - G5 . E5 . D5 .
         C5 . D5 . E5 . G5 . E5 - - - . . . .
         F5 . A5 . G5 . E5 . D5 . E5 . C5 . D5 .
         E5 . D5 . C5 - - - . . G4 . A4 . B4 .`,
        lead(0.045),
      ),
      voice(
        `C3 . . . G3 . . . C3 . . . G3 . C3 .
         A2 . . . E3 . . . A2 . . . E3 . A2 .
         F2 . . . C3 . . . F2 . . . C3 . F2 .
         G2 . . . D3 . . . G2 . . . B2 . D3 .`,
        bass,
      ),
    ],
    [
      beat("x.......x.......".repeat(4), kick),
      beat("..x...x...x...x.".repeat(4), hat),
      beat("....x.......x...".repeat(4), clap),
    ],
  ),
  think: track(
    128,
    [
      voice(
        `A4 . C5 . E5 . C5 . A4 . C5 . E5 . C5 .
         F4 . A4 . C5 . A4 . F4 . A4 . C5 . A4 .
         G4 . C5 . E5 . C5 . G4 . C5 . E5 . C5 .
         G4 . B4 . D5 . B4 . G4 . B4 . D5 . E5 .`,
        pluck(0.12),
      ),
      voice(
        `A2 . A3 . A2 . A3 . A2 . A3 . A2 . A3 .
         F2 . F3 . F2 . F3 . F2 . F3 . F2 . F3 .
         C3 . C4 . C3 . C4 . C3 . C4 . C3 . C4 .
         G2 . G3 . G2 . G3 . G2 . G3 . B2 . D3 .`,
        bass,
      ),
    ],
    [beat("x...x...x...x...".repeat(4), (t, bus) => kick(t, bus, 0.35)), beat("xxxxxxxxxxxxxxxx".repeat(4), hat)],
  ),
  party: track(
    124,
    [
      voice(
        `G5 . G5 . D5 . G5 . B5 - A5 . G5 . D5 .
         E5 . G5 . C6 - B5 . A5 . G5 . E5 . . .
         F#5 . A5 . D6 - C6 . B5 . A5 . F#5 . D5 .
         G5 - - . B5 - - . G5 - - - . . . .`,
        lead(0.045),
      ),
      voice(
        `G2 . . . D3 . G2 . G2 . . . D3 . B2 .
         C3 . . . G3 . C3 . C3 . . . G3 . E3 .
         D3 . . . A3 . D3 . D3 . . . A3 . F#3 .
         G2 . . . D3 . G2 . G2 . D3 . G2 . . .`,
        bass,
      ),
    ],
    [
      beat("x...x...x...x...".repeat(4), kick),
      beat("..x...x...x...x.".repeat(4), hat),
      beat("....x.......x...".repeat(4), clap),
    ],
  ),
};
export type TrackName = keyof typeof TRACKS;

let wanted: TrackName | null = null;
let playing: { name: TrackName; bus: GainNode; timer: ReturnType<typeof setInterval> } | null = null;

function stopMusic() {
  if (!playing || !ctx) return;
  const { bus, timer } = playing;
  clearInterval(timer);
  bus.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
  setTimeout(() => bus.disconnect(), 800);
  playing = null;
}

function startMusic(name: TrackName) {
  const ac = audio();
  if (!ac) return;
  const tr = TRACKS[name];
  const bus = ac.createGain();
  bus.gain.setValueAtTime(0, ac.currentTime);
  bus.gain.linearRampToValueAtTime(0.5, ac.currentTime + 0.4);
  bus.connect(out!);
  const stepDur = 60 / tr.bpm / 4;
  let step = 0;
  let next = ac.currentTime + 0.05;
  const schedule = () => {
    // A throttled background tab can fall behind; skip ahead instead of firing a burst of old notes.
    if (next < ac.currentTime - 0.05) next = ac.currentTime + 0.02;
    while (next < ac.currentTime + 0.15) {
      const s = step % tr.length;
      for (const v of tr.voices) {
        const n = v.steps[s];
        if (n) v.play(next, n.freq, n.len * stepDur, bus);
      }
      for (const d of tr.drums) if (d.steps[s]) d.play(next, bus);
      next += stepDur;
      step++;
    }
  };
  schedule();
  playing = { name, bus, timer: setInterval(schedule, 25) };
}

/** Switches the background loop. `null` fades it out. */
export function music(name: TrackName | null) {
  wanted = name;
  if (playing?.name === name) return;
  stopMusic();
  if (name && enabled) startMusic(name);
}

/** Keeps `name` playing while the calling component is mounted. */
export function useMusic(name: TrackName | null) {
  useEffect(() => {
    music(name);
  }, [name]);
  useEffect(() => () => music(null), []);
}

// ---------- on/off preference ----------

export function setSoundOn(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {}
  if (on) {
    audio();
    if (wanted && !playing) startMusic(wanted);
  } else {
    stopMusic();
  }
  listeners.forEach((l) => l());
}

export function useSoundOn() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => enabled,
    () => true,
  );
}
