import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { LIMITS, scoreFor } from "../quiz";
import type { HostView, Phase, PlayerRow, PlayerView, Quiz, RoomEvent } from "../types";
import { kv } from "./kv";

// Room state lives in Redis so every serverless instance sees the same game.
// Each room is a few keys; writers that can race (join, answer, reveal) use atomic
// commands, and every change bumps `ver` so open event streams know to reload.

type RoomDoc = {
  hostKey: string;
  quiz: Quiz;
  phase: Phase;
  qIndex: number;
  startedAt: number;
  endsAt: number;
  prevRanks: Record<string, number>; // ranks when the current question started
};

type PlayerDoc = {
  id: string;
  token: string;
  name: string;
  score: number;
  streak: number;
  lastGain: number;
  results: (number | null)[];
};

type Answer = { choice: number; at: number };

type Snapshot = {
  code: string;
  room: RoomDoc;
  players: Record<string, PlayerDoc>;
  answers: Record<string, Answer>;
  seen: Record<string, number>;
  ranks: Record<string, number>;
};

const TTL = 12 * 60 * 60; // seconds; a class never runs this long
const GRACE_MS = 800; // absorbs network latency on last-second answers
const ONLINE_MS = 25_000; // a player whose stream hasn't checked in for this long counts as offline
const POLL_MS = 1000;
const BEAT_MS = 10_000;

const key = {
  room: (c: string) => `qk:${c}:room`,
  ver: (c: string) => `qk:${c}:ver`,
  players: (c: string) => `qk:${c}:players`,
  names: (c: string) => `qk:${c}:names`,
  seen: (c: string) => `qk:${c}:seen`,
  answers: (c: string, q: number) => `qk:${c}:ans:${q}`,
  lock: (c: string, q: number) => `qk:${c}:reveal:${q}`,
};

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; status: number };
const fail = (error: string, status = 400) => ({ ok: false, error, status }) as const;
const NOT_FOUND = fail("Kode ruangan tidak ditemukan.", 404);

const getRoom = (code: string) => kv.get<RoomDoc>(key.room(code));
const bump = (code: string) => kv.incr(key.ver(code));

async function saveRoom(code: string, room: RoomDoc) {
  await kv.set(key.room(code), room, { ex: TTL });
  await bump(code);
}

export async function createRoom(quiz: Quiz) {
  const room: RoomDoc = {
    hostKey: randomUUID(),
    quiz,
    phase: "lobby",
    qIndex: -1,
    startedAt: 0,
    endsAt: 0,
    prevRanks: {},
  };
  for (;;) {
    const code = String(randomInt(100000, 1000000));
    if (await kv.set(key.room(code), room, { ex: TTL, nx: true })) {
      await kv.set(key.ver(code), 0, { ex: TTL });
      return { code, hostKey: room.hostKey };
    }
  }
}

export async function publicInfo(code: string) {
  const room = await getRoom(code);
  if (!room) return null;
  return { title: room.quiz.title, phase: room.phase, playerCount: await kv.hlen(key.players(code)) };
}

async function load(code: string): Promise<Snapshot | null> {
  const room = await getRoom(code);
  if (!room) return null;
  const [players, seen, answers] = await Promise.all([
    kv.hgetall<PlayerDoc>(key.players(code)),
    kv.hgetall<number>(key.seen(code)),
    room.qIndex >= 0 ? kv.hgetall<Answer>(key.answers(code, room.qIndex)) : Promise.resolve({}),
  ]);
  return { code, room, players, answers, seen, ranks: rankMap(players) };
}

// Standard competition ranking: equal scores share a rank (1, 2, 2, 4).
function rankMap(players: Record<string, PlayerDoc>) {
  const scores = Object.values(players).map((p) => p.score);
  return Object.fromEntries(
    Object.values(players).map((p) => [p.id, 1 + scores.filter((s) => s > p.score).length]),
  );
}

// ---------- player actions ----------

export async function join(code: string, rawName: unknown): Promise<Result<{ pid: string; token: string }>> {
  const name = typeof rawName === "string" ? rawName.replace(/\s+/g, " ").trim().slice(0, LIMITS.name) : "";
  if (!name) return fail("Isi nama dulu.");
  const room = await getRoom(code);
  if (!room) return NOT_FOUND;
  if (room.phase === "ended") return fail("Kuis ini sudah selesai.", 410);
  if ((await kv.hlen(key.players(code))) >= LIMITS.players) return fail("Ruangan sudah penuh.", 409);

  const player: PlayerDoc = {
    id: randomBytes(5).toString("hex"),
    token: randomUUID(),
    name,
    score: 0,
    streak: 0,
    lastGain: 0,
    // Late joiners simply have no answers for questions already played.
    results: room.quiz.questions.map(() => null),
  };
  // Claiming the name atomically keeps two phones from both getting "Budi".
  if (!(await kv.hsetnx(key.names(code), name.toLowerCase(), player.id))) {
    return fail("Nama itu sudah dipakai di ruangan ini. Coba nama lain.", 409);
  }
  await Promise.all([
    kv.hset(key.players(code), { [player.id]: player }),
    kv.hset(key.seen(code), { [player.id]: Date.now() }),
    kv.expire(key.names(code), TTL),
    kv.expire(key.players(code), TTL),
    kv.expire(key.seen(code), TTL),
  ]);
  await bump(code);
  return { ok: true, pid: player.id, token: player.token };
}

export async function answer(code: string, pid: unknown, token: unknown, qIndex: unknown, choice: unknown): Promise<Result> {
  if (typeof pid !== "string") return fail("Sesi kamu tidak dikenal. Masuk lagi.", 401);
  const [room, player] = await Promise.all([getRoom(code), kv.hget<PlayerDoc>(key.players(code), pid)]);
  if (!room) return NOT_FOUND;
  if (!player || player.token !== token) return fail("Sesi kamu tidak dikenal. Masuk lagi.", 401);

  const q = room.quiz.questions[room.qIndex];
  if (room.phase !== "question" || qIndex !== room.qIndex) return fail("Waktu menjawab sudah lewat.", 409);
  if (Date.now() > room.endsAt + GRACE_MS) return fail("Waktu menjawab sudah lewat.", 409);
  if (typeof choice !== "number" || !Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    return fail("Pilihan tidak dikenal.");
  }

  const answersKey = key.answers(code, room.qIndex);
  if (!(await kv.hsetnx(answersKey, pid, { choice, at: Date.now() } satisfies Answer))) {
    return fail("Kamu sudah menjawab soal ini.", 409);
  }
  await Promise.all([kv.expire(answersKey, TTL), bump(code)]);

  // Close the question early once every connected player has answered.
  const [answers, seen] = await Promise.all([kv.hgetall<Answer>(answersKey), kv.hgetall<number>(key.seen(code))]);
  const now = Date.now();
  const online = Object.keys(seen).filter((id) => now - seen[id] < ONLINE_MS);
  if (online.length > 0 && online.every((id) => id in answers)) await reveal(code, room.qIndex);
  return { ok: true };
}

// ---------- host actions ----------

export async function hostAction(
  code: string,
  hostKey: unknown,
  action: unknown,
  payload: Record<string, unknown>,
): Promise<Result> {
  const room = await getRoom(code);
  if (!room) return NOT_FOUND;
  if (typeof hostKey !== "string" || hostKey !== room.hostKey) {
    return fail("Hanya pengajar yang bisa melakukan ini.", 403);
  }

  switch (action) {
    case "start":
      if (room.phase !== "lobby") return fail("Kuis sudah berjalan.", 409);
      if ((await kv.hlen(key.players(code))) === 0) return fail("Tunggu minimal satu peserta masuk.", 409);
      await startQuestion(code, room, 0);
      return { ok: true };

    case "reveal":
      if (room.phase !== "question") return fail("Tidak ada soal yang sedang berjalan.", 409);
      await reveal(code, room.qIndex);
      return { ok: true };

    case "next":
      if (room.phase === "reveal") {
        const last = room.qIndex >= room.quiz.questions.length - 1;
        await saveRoom(code, { ...room, phase: last ? "ended" : "leaderboard" });
      } else if (room.phase === "leaderboard") {
        await startQuestion(code, room, room.qIndex + 1);
      } else {
        return fail("Belum bisa lanjut dari tahap ini.", 409);
      }
      return { ok: true };

    case "end": {
      if (room.phase === "question") await reveal(code, room.qIndex);
      const latest = (await getRoom(code)) ?? room;
      await saveRoom(code, { ...latest, phase: "ended" });
      return { ok: true };
    }

    case "kick": {
      const pid = typeof payload.pid === "string" ? payload.pid : "";
      const p = await kv.hget<PlayerDoc>(key.players(code), pid);
      if (!p) return fail("Peserta tidak ditemukan.", 404);
      await Promise.all([
        kv.hdel(key.players(code), pid),
        kv.hdel(key.names(code), p.name.toLowerCase()),
        kv.hdel(key.seen(code), pid),
      ]);
      await bump(code);
      return { ok: true };
    }
  }
  return fail("Aksi tidak dikenal.");
}

async function startQuestion(code: string, room: RoomDoc, index: number) {
  const players = await kv.hgetall<PlayerDoc>(key.players(code));
  const startedAt = Date.now();
  await saveRoom(code, {
    ...room,
    phase: "question",
    qIndex: index,
    startedAt,
    endsAt: startedAt + room.quiz.questions[index].time * 1000,
    // Before the first question everyone ties at rank 1, so there is no movement to show yet.
    prevRanks: index === 0 ? {} : rankMap(players),
  });
}

/** Scores the question and moves to "reveal". Safe to call from many places at once. */
async function reveal(code: string, qIndex: number) {
  // Host button, time-out and "everyone answered" can all fire together; only one may score.
  if (!(await kv.set(key.lock(code, qIndex), 1, { ex: 120, nx: true }))) return;
  const s = await load(code);
  if (!s || s.room.phase !== "question" || s.room.qIndex !== qIndex) return;

  const q = s.room.quiz.questions[qIndex];
  const updated: Record<string, PlayerDoc> = {};
  for (const p of Object.values(s.players)) {
    const a = s.answers[p.id];
    const gain = a && a.choice === q.correct ? scoreFor(a.at - s.room.startedAt, q.time * 1000) : 0;
    const results = [...p.results];
    results[qIndex] = a ? gain : null;
    updated[p.id] = { ...p, results, lastGain: gain, score: p.score + gain, streak: gain > 0 ? p.streak + 1 : 0 };
  }
  if (Object.keys(updated).length) await kv.hset(key.players(code), updated);
  await saveRoom(code, { ...s.room, phase: "reveal" });
}

// ---------- streaming ----------
//
// Streams for the same room on one instance share a single watcher, which polls the
// room's version once a second and reloads the full state only when it changed.

type Sub = { send: (e: RoomEvent) => void } & (
  | { role: "host" }
  // `joined` flips once a snapshot containing this player was delivered; only then
  // does the player's absence mean they were kicked (and not that the snapshot is older than their join).
  | { role: "player"; pid: string; joined?: boolean }
);

type Watcher = {
  subs: Set<Sub>;
  ver: number;
  snap: Snapshot | null;
  timer: ReturnType<typeof setInterval>;
  busy: boolean;
  lastBeat: number;
};

const g = globalThis as unknown as { __qkWatchers?: Map<string, Watcher> };
const watchers = (g.__qkWatchers ??= new Map<string, Watcher>());

/** Checks credentials before a stream opens. */
export async function canWatch(code: string, auth: { host?: string | null; pid?: string | null; token?: string | null }) {
  const room = await getRoom(code);
  if (!room) return "closed" as const;
  if (auth.host) return auth.host === room.hostKey ? "ok" : ("kicked" as const);
  const p = auth.pid ? await kv.hget<PlayerDoc>(key.players(code), auth.pid) : null;
  return p && p.token === auth.token ? "ok" : ("kicked" as const);
}

export function watch(code: string, sub: Sub) {
  let w = watchers.get(code);
  if (!w) {
    const fresh: Watcher = { subs: new Set(), ver: -1, snap: null, timer: undefined!, busy: false, lastBeat: 0 };
    fresh.timer = setInterval(() => void tick(code, fresh), POLL_MS);
    watchers.set(code, (w = fresh));
  }
  w.subs.add(sub);

  if (sub.role === "player") {
    // Mark online right away so the host's lobby shows the player as connected.
    void kv.hset(key.seen(code), { [sub.pid]: Date.now() }).then(() => bump(code));
  }
  if (w.snap) deliver(w, sub);
  else void tick(code, w);

  const watcher = w;
  return () => {
    watcher.subs.delete(sub);
    if (watcher.subs.size === 0) {
      clearInterval(watcher.timer);
      watchers.delete(code);
    }
  };
}

async function tick(code: string, w: Watcher) {
  if (w.busy) return;
  w.busy = true;
  try {
    const ver = await kv.get<number>(key.ver(code));
    if (ver === null) return closeAll(code, w);
    if (ver !== w.ver || !w.snap) {
      const snap = await load(code);
      if (!snap) return closeAll(code, w);
      w.ver = ver;
      w.snap = snap;
      for (const s of w.subs) deliver(w, s);
    }

    const now = Date.now();
    const { room } = w.snap;
    // Serverless has no reliable timers, so whoever is watching closes the question when time is up.
    if (room.phase === "question" && now > room.endsAt + GRACE_MS) await reveal(code, room.qIndex);

    if (now - w.lastBeat > BEAT_MS) {
      w.lastBeat = now;
      const pids = [...w.subs].flatMap((s) => (s.role === "player" ? [s.pid] : []));
      if (pids.length) await kv.hset(key.seen(code), Object.fromEntries(pids.map((p) => [p, now])));
    }
  } catch (err) {
    console.error("room watcher", code, err);
  } finally {
    w.busy = false;
  }
}

function closeAll(code: string, w: Watcher) {
  for (const s of w.subs) s.send({ type: "gone", reason: "closed" });
  w.subs.clear();
  clearInterval(w.timer);
  watchers.delete(code);
}

function deliver(w: Watcher, sub: Sub) {
  const view = viewFor(w.snap!, sub);
  if (view) {
    if (sub.role === "player") sub.joined = true;
    sub.send({ type: "state", view });
  } else if (sub.role === "player" && sub.joined) {
    sub.send({ type: "gone", reason: "kicked" });
    w.subs.delete(sub);
  }
}

function viewFor(s: Snapshot, sub: Sub): HostView | PlayerView | null {
  const { room } = s;
  const q = room.quiz.questions[room.qIndex] ?? null;
  const base = {
    code: s.code,
    title: room.quiz.title,
    phase: room.phase,
    qIndex: room.qIndex,
    total: room.quiz.questions.length,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    now: Date.now(),
  };
  const sorted = Object.values(s.players).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  if (sub.role === "host") {
    const distribution = q ? q.options.map(() => 0) : [];
    for (const a of Object.values(s.answers)) distribution[a.choice]++;
    return {
      ...base,
      role: "host",
      question: q,
      players: sorted.map((p) => toRow(s, p)),
      answerCount: Object.keys(s.answers).length,
      distribution,
      questions: room.quiz.questions,
    };
  }

  const p = s.players[sub.pid];
  if (!p) return null;
  return {
    ...base,
    role: "player",
    question: q && { ...q, correct: room.phase === "question" ? -1 : q.correct },
    playerCount: sorted.length,
    me: {
      id: p.id,
      name: p.name,
      score: p.score,
      rank: s.ranks[p.id],
      prevRank: room.prevRanks[p.id] ?? 0,
      lastGain: p.lastGain,
      streak: p.streak,
      choice: s.answers[p.id]?.choice ?? null,
    },
    podium: room.phase === "ended" ? sorted.slice(0, 3).map((x) => ({ name: x.name, score: x.score })) : [],
  };
}

function toRow(s: Snapshot, p: PlayerDoc): PlayerRow {
  return {
    id: p.id,
    name: p.name,
    score: p.score,
    rank: s.ranks[p.id],
    prevRank: s.room.prevRanks[p.id] ?? 0,
    lastGain: p.lastGain,
    streak: p.streak,
    online: Date.now() - (s.seen[p.id] ?? 0) < ONLINE_MS,
    answered: p.id in s.answers,
    results: p.results,
  };
}
