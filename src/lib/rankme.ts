"use client";

// Mode RankMe: students take turns on one device instead of joining with their own phones.
// Everything lives in this browser only — no room, no Redis, no network race to worry about.

import { store } from "./client";
import type { Quiz } from "./types";

export type RankMePlayer = {
  id: string;
  name: string;
  score: number;
  streak: number;
  results: (number | null)[]; // points per question, null = no answer
};

export type RankMeSession = {
  quiz: Quiz;
  players: RankMePlayer[];
};

const KEY = "qk:rankme:session";

/** Called from the quiz list to begin a fresh RankMe session with this quiz. */
export function startRankMe(quiz: Quiz) {
  store.set(KEY, { quiz: structuredClone(quiz), players: [] } satisfies RankMeSession);
}

export function loadRankMe(): RankMeSession | null {
  return store.get<RankMeSession>(KEY);
}

export function saveRankMe(session: RankMeSession) {
  store.set(KEY, session);
}

export function clearRankMe() {
  store.remove(KEY);
}

export function newPlayerId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Standard competition ranking: equal scores share a rank (1, 2, 2, 4). */
export function rankOf(players: RankMePlayer[], score: number) {
  return 1 + players.filter((p) => p.score > score).length;
}

export function sortedPlayers(players: RankMePlayer[]) {
  return [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
