// Shared between server and client. Everything here crosses the wire as JSON.

export type Question = {
  text: string;
  options: string[]; // 2–4 entries
  correct: number; // index into options
  time: number; // seconds
};

export type Quiz = {
  title: string;
  questions: Question[];
};

export type Phase = "lobby" | "question" | "reveal" | "leaderboard" | "ended";

export type PlayerRow = {
  id: string;
  name: string;
  score: number;
  rank: number;
  prevRank: number;
  lastGain: number;
  streak: number;
  online: boolean;
  answered: boolean;
  results: (number | null)[]; // points per question, null = no answer
};

type BaseView = {
  code: string;
  title: string;
  phase: Phase;
  qIndex: number;
  total: number;
  startedAt: number;
  endsAt: number;
  now: number; // server clock, for skew correction
};

export type HostView = BaseView & {
  role: "host";
  question: Question | null;
  players: PlayerRow[]; // sorted by rank
  answerCount: number;
  distribution: number[]; // answers per option for current question
  questions: Question[]; // needed for the CSV export
};

export type PlayerView = BaseView & {
  role: "player";
  // `correct` is -1 until the host reveals it.
  question: Question | null;
  playerCount: number;
  me: {
    id: string;
    name: string;
    score: number;
    rank: number;
    prevRank: number;
    lastGain: number;
    streak: number;
    choice: number | null; // what I picked for the current question
  };
  podium: { name: string; score: number }[]; // only filled when ended
};

export type RoomEvent =
  | { type: "state"; view: HostView | PlayerView }
  | { type: "gone"; reason: "kicked" | "closed" };
