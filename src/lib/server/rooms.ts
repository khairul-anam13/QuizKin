import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { LIMITS, scoreFor } from "../quiz";
import type { HostView, Phase, PlayerRow, PlayerView, Quiz, RoomEvent } from "../types";

// Rooms live in memory: one long-running Node process is the whole backend.
// Kept on globalThis so dev-mode hot reloads don't wipe running games.

type Player = {
  id: string;
  token: string;
  name: string;
  score: number;
  streak: number;
  lastGain: number;
  rank: number;
  prevRank: number;
  results: (number | null)[];
  online: number; // open event streams
};

type Sub = { send: (e: RoomEvent) => void } & ({ role: "host" } | { role: "player"; pid: string });

type Room = {
  code: string;
  hostKey: string;
  quiz: Quiz;
  phase: Phase;
  qIndex: number;
  startedAt: number;
  endsAt: number;
  players: Map<string, Player>;
  answers: Map<string, { choice: number; at: number }>;
  subs: Set<Sub>;
  timer: ReturnType<typeof setTimeout> | null;
  touchedAt: number;
};

const GRACE_MS = 800; // absorbs network latency on last-second answers
const IDLE_MS = 4 * 60 * 60 * 1000;

const g = globalThis as unknown as { __qkRooms?: Map<string, Room>; __qkSweep?: boolean };
const rooms = (g.__qkRooms ??= new Map<string, Room>());

if (!g.__qkSweep) {
  g.__qkSweep = true;
  setInterval(() => {
    const cutoff = Date.now() - IDLE_MS;
    for (const room of rooms.values()) {
      if (room.touchedAt < cutoff) closeRoom(room);
    }
  }, 10 * 60 * 1000).unref();
}

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false, error, status }) as const;

export function createRoom(quiz: Quiz) {
  let code: string;
  do code = String(randomInt(100000, 1000000));
  while (rooms.has(code));

  const room: Room = {
    code,
    hostKey: randomUUID(),
    quiz,
    phase: "lobby",
    qIndex: -1,
    startedAt: 0,
    endsAt: 0,
    players: new Map(),
    answers: new Map(),
    subs: new Set(),
    timer: null,
    touchedAt: Date.now(),
  };
  rooms.set(code, room);
  return { code, hostKey: room.hostKey };
}

export function getRoom(code: string) {
  const room = rooms.get(code);
  if (room) room.touchedAt = Date.now();
  return room ?? null;
}

export function publicInfo(room: Room) {
  return { title: room.quiz.title, phase: room.phase, playerCount: room.players.size };
}

export function isHost(room: Room, key: unknown) {
  return typeof key === "string" && key === room.hostKey;
}

export function playerFor(room: Room, pid: unknown, token: unknown) {
  const p = typeof pid === "string" ? room.players.get(pid) : undefined;
  return p && p.token === token ? p : null;
}

// ---------- player actions ----------

export function join(room: Room, rawName: unknown): Result<{ pid: string; token: string }> {
  const name = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim().slice(0, LIMITS.name) : "";
  if (!name) return fail("Isi nama dulu.");
  if (room.phase === "ended") return fail("Kuis ini sudah selesai.", 410);
  if (room.players.size >= LIMITS.players) return fail("Ruangan sudah penuh.", 409);
  const taken = [...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
  if (taken) return fail("Nama itu sudah dipakai di ruangan ini. Coba nama lain.", 409);

  const player: Player = {
    id: randomBytes(5).toString("hex"),
    token: randomUUID(),
    name,
    score: 0,
    streak: 0,
    lastGain: 0,
    rank: 0,
    prevRank: 0,
    // Late joiners simply have no answers for questions already played.
    results: room.quiz.questions.map(() => null),
    online: 0,
  };
  room.players.set(player.id, player);
  rerank(room);
  player.prevRank = player.rank;
  emit(room);
  return { ok: true, pid: player.id, token: player.token };
}

export function answer(room: Room, player: Player, qIndex: unknown, choice: unknown): Result {
  const q = room.quiz.questions[room.qIndex];
  if (room.phase !== "question" || qIndex !== room.qIndex) return fail("Waktu menjawab sudah lewat.", 409);
  if (Date.now() > room.endsAt + GRACE_MS) return fail("Waktu menjawab sudah lewat.", 409);
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    return fail("Pilihan tidak dikenal.");
  }
  if (room.answers.has(player.id)) return fail("Kamu sudah menjawab soal ini.", 409);

  room.answers.set(player.id, { choice, at: Date.now() });

  const online = [...room.players.values()].filter((p) => p.online > 0);
  if (online.length > 0 && online.every((p) => room.answers.has(p.id))) {
    reveal(room);
  } else {
    emit(room, player.id);
  }
  return { ok: true };
}

// ---------- host actions ----------

export function hostAction(room: Room, action: unknown, payload: Record<string, unknown>): Result {
  switch (action) {
    case "start":
      if (room.phase !== "lobby") return fail("Kuis sudah berjalan.", 409);
      if (room.players.size === 0) return fail("Tunggu minimal satu peserta masuk.", 409);
      startQuestion(room, 0);
      return { ok: true };

    case "reveal":
      if (room.phase !== "question") return fail("Tidak ada soal yang sedang berjalan.", 409);
      reveal(room);
      return { ok: true };

    case "next":
      if (room.phase === "reveal") {
        const last = room.qIndex >= room.quiz.questions.length - 1;
        setPhase(room, last ? "ended" : "leaderboard");
      } else if (room.phase === "leaderboard") {
        startQuestion(room, room.qIndex + 1);
      } else {
        return fail("Belum bisa lanjut dari tahap ini.", 409);
      }
      return { ok: true };

    case "end":
      if (room.phase === "question") reveal(room, false);
      setPhase(room, "ended");
      return { ok: true };

    case "kick": {
      const p = typeof payload.pid === "string" ? room.players.get(payload.pid) : undefined;
      if (!p) return fail("Peserta tidak ditemukan.", 404);
      room.players.delete(p.id);
      room.answers.delete(p.id);
      for (const s of room.subs) {
        if (s.role !== "player" || s.pid !== p.id) continue;
        s.send({ type: "gone", reason: "kicked" });
        room.subs.delete(s);
      }
      rerank(room);
      emit(room);
      return { ok: true };
    }
  }
  return fail("Aksi tidak dikenal.");
}

function startQuestion(room: Room, index: number) {
  const q = room.quiz.questions[index];
  // Before the first question everyone ties at rank 1, so there is no movement to show yet.
  for (const p of room.players.values()) p.prevRank = index === 0 ? 0 : p.rank;
  room.answers.clear();
  room.qIndex = index;
  room.phase = "question";
  room.startedAt = Date.now();
  room.endsAt = room.startedAt + q.time * 1000;
  clearTimer(room);
  room.timer = setTimeout(() => reveal(room), q.time * 1000 + GRACE_MS);
  emit(room);
}

function reveal(room: Room, broadcast = true) {
  if (room.phase !== "question") return;
  clearTimer(room);
  const q = room.quiz.questions[room.qIndex];
  const limit = q.time * 1000;

  for (const p of room.players.values()) {
    const a = room.answers.get(p.id);
    const gain = a && a.choice === q.correct ? scoreFor(a.at - room.startedAt, limit) : 0;
    p.results[room.qIndex] = a ? gain : null;
    p.lastGain = gain;
    p.score += gain;
    p.streak = gain > 0 ? p.streak + 1 : 0;
  }
  rerank(room);
  room.phase = "reveal";
  if (broadcast) emit(room);
}

function setPhase(room: Room, phase: Phase) {
  clearTimer(room);
  room.phase = phase;
  emit(room);
}

function clearTimer(room: Room) {
  if (room.timer) clearTimeout(room.timer);
  room.timer = null;
}

function closeRoom(room: Room) {
  clearTimer(room);
  for (const s of room.subs) s.send({ type: "gone", reason: "closed" });
  room.subs.clear();
  rooms.delete(room.code);
}

// Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
function rerank(room: Room) {
  const scores = [...room.players.values()].map((p) => p.score);
  for (const p of room.players.values()) p.rank = 1 + scores.filter((s) => s > p.score).length;
}

// ---------- streaming ----------

export function subscribe(room: Room, sub: Sub) {
  room.subs.add(sub);
  const player = sub.role === "player" ? room.players.get(sub.pid) : undefined;
  if (player) player.online++;
  sub.send({ type: "state", view: viewFor(room, sub) });
  if (player) emit(room, "host-only");

  return () => {
    room.subs.delete(sub);
    if (player) {
      player.online--;
      emit(room, "host-only");
    }
  };
}

/** Push fresh state. `only` narrows it to the host plus one player (or just the host). */
function emit(room: Room, only?: string) {
  room.touchedAt = Date.now();
  for (const s of room.subs) {
    if (only && s.role === "player" && s.pid !== only) continue;
    s.send({ type: "state", view: viewFor(room, s) });
  }
}

function viewFor(room: Room, sub: Sub): HostView | PlayerView {
  const q = room.quiz.questions[room.qIndex] ?? null;
  const base = {
    code: room.code,
    title: room.quiz.title,
    phase: room.phase,
    qIndex: room.qIndex,
    total: room.quiz.questions.length,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    now: Date.now(),
  };

  if (sub.role === "host") {
    const distribution = q ? q.options.map(() => 0) : [];
    for (const a of room.answers.values()) distribution[a.choice]++;
    return {
      ...base,
      role: "host",
      question: q,
      players: sortedPlayers(room).map((p) => toRow(room, p)),
      answerCount: room.answers.size,
      distribution,
      questions: room.quiz.questions,
    };
  }

  const p = room.players.get(sub.pid);
  if (!p) throw new Error("subscriber for unknown player");
  const showCorrect = room.phase !== "question";
  return {
    ...base,
    role: "player",
    question: q && { ...q, correct: showCorrect ? q.correct : -1 },
    playerCount: room.players.size,
    me: {
      id: p.id,
      name: p.name,
      score: p.score,
      rank: p.rank,
      prevRank: p.prevRank,
      lastGain: p.lastGain,
      streak: p.streak,
      choice: room.answers.get(p.id)?.choice ?? null,
    },
    podium:
      room.phase === "ended"
        ? sortedPlayers(room)
            .slice(0, 3)
            .map((x) => ({ name: x.name, score: x.score }))
        : [],
  };
}

function sortedPlayers(room: Room) {
  return [...room.players.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function toRow(room: Room, p: Player): PlayerRow {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    rank: p.rank,
    prevRank: p.prevRank,
    lastGain: p.lastGain,
    streak: p.streak,
    online: p.online > 0,
    answered: room.answers.has(p.id),
    results: p.results,
  };
}
