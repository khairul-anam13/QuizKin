"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSecondsLeft, vibrate } from "@/lib/client";
import { confetti } from "@/lib/confetti";
import {
  clearRankMe,
  loadRankMe,
  newPlayerId,
  rankOf,
  saveRankMe,
  sortedPlayers,
  type RankMePlayer,
  type RankMeSession,
} from "@/lib/rankme";
import { LIMITS, OPTION_LETTERS, scoreFor } from "@/lib/quiz";
import { music, sfx, useMusic, type TrackName } from "@/lib/sound";
import { Doodles } from "./Doodles";
import { Connecting, Letter, Notice, SoundToggle, Streak, TimerBar, useCountUp } from "./GameParts";
import { Crown } from "./Icons";

type Phase = "roster" | "name" | "question" | "reveal" | "turn-done" | "ended";

const TRACK_FOR: Record<Phase, TrackName | null> = {
  roster: "lobby",
  name: "lobby",
  question: "think",
  reveal: null,
  "turn-done": null,
  ended: null,
};

const CHEERS = ["Hebat!", "Pintar sekali!", "Keren!", "Mantap!", "Luar biasa!"];
const COMFORT = ["Tidak apa-apa, ayo coba lagi di soal berikutnya!", "Hampir! Semangat terus, ya.", "Salah itu bagian dari belajar. Lanjut!"];

export function RankMeScreen() {
  const [session, setSession] = useState<RankMeSession | null | undefined>(undefined);
  useEffect(() => setSession(loadRankMe()), []);

  const [phase, setPhase] = useState<Phase>("roster");
  const [name, setName] = useState("");
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [results, setResults] = useState<(number | null)[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [lastGain, setLastGain] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [endsAt, setEndsAt] = useState(0);

  useMusic(session ? TRACK_FOR[phase] : null);
  const left = useSecondsLeft(endsAt, 0, phase === "question");

  useEffect(() => {
    if (phase === "question" && left > 0 && left <= 5) sfx("tick");
  }, [left, phase]);

  // Hooks must run unconditionally on every render, so this stays above the early
  // returns below and checks `session` itself instead of relying on later consts.
  // `left` only re-renders the effect on each tick; the real deadline check is against
  // `endsAt` directly, since `left` can still read a stale 0 on the render where a
  // fresh question just started (its own interval hasn't caught up yet).
  useEffect(() => {
    if (!session || phase !== "question" || picked !== null || Date.now() < endsAt) return;
    setLastGain(0);
    setStreak(0);
    setResults((r) => {
      const next = [...r];
      next[qIndex] = null;
      return next;
    });
    setPhase("reveal");
  }, [session, phase, endsAt, picked, qIndex, left]);

  if (session === undefined) return <Connecting />;
  if (session === null) {
    return (
      <Notice title="Belum ada kuis dipilih">
        <p>Buka salah satu kuis di daftar lalu ketuk “Mode RankMe” untuk memulainya di sini.</p>
        <Link className="btn btn-primary" href="/buat">
          Ke kuis saya
        </Link>
      </Notice>
    );
  }

  const { quiz } = session;
  const q = quiz.questions[qIndex];
  const isLast = qIndex === quiz.questions.length - 1;
  const sorted = sortedPlayers(session.players);

  function startName() {
    setName("");
    setPhase("name");
  }

  function submitName(e: React.FormEvent) {
    e.preventDefault();
    const now = Date.now();
    setQIndex(0);
    setScore(0);
    setStreak(0);
    setResults(quiz.questions.map(() => null));
    setPicked(null);
    setStartedAt(now);
    setEndsAt(now + quiz.questions[0].time * 1000);
    setPhase("question");
    sfx("pop");
  }

  function commitAnswer(choice: number | null) {
    const gain = choice !== null && choice === q.correct ? scoreFor(Date.now() - startedAt, q.time * 1000) : 0;
    setPicked(choice);
    setLastGain(gain);
    setScore((s) => s + gain);
    setStreak((s) => (gain > 0 ? s + 1 : 0));
    setResults((r) => {
      const next = [...r];
      next[qIndex] = gain > 0 ? gain : null;
      return next;
    });
    setPhase("reveal");
  }

  function continueAfterReveal() {
    if (!isLast) {
      const now = Date.now();
      const next = qIndex + 1;
      setQIndex(next);
      setPicked(null);
      setStartedAt(now);
      setEndsAt(now + quiz.questions[next].time * 1000);
      setPhase("question");
    } else {
      finishTurn();
    }
  }

  function finishTurn() {
    const player: RankMePlayer = { id: newPlayerId(), name: name.trim() || "Tanpa nama", score, streak, results };
    const next: RankMeSession = { ...session!, players: [...session!.players, player] };
    saveRankMe(next);
    setSession(next);
    sfx("whoosh");
    setPhase("turn-done");
  }

  function endSession() {
    setPhase("ended");
  }

  function startOver() {
    clearRankMe();
  }

  return (
    <div className="player" data-phase={phase}>
      {(phase === "roster" || phase === "name" || phase === "turn-done" || phase === "ended") && (
        <Doodles set={phase === "turn-done" || phase === "ended" ? "cheer" : "wait"} />
      )}
      <header className="player-bar">
        <span className="player-name">
          {phase === "roster" || phase === "name" || phase === "ended" ? quiz.title : name}
        </span>
        <SoundToggle />
        {(phase === "question" || phase === "reveal" || phase === "turn-done") && (
          <span className="score-pill" aria-label={`Skor ${score}`}>
            {score.toLocaleString("id-ID")}
          </span>
        )}
      </header>

      <main className="player-stage">
        {phase === "roster" && <Roster session={session} sorted={sorted} onNext={startName} onEnd={endSession} />}
        {phase === "name" && <NameForm name={name} setName={setName} onSubmit={submitName} onCancel={() => setPhase("roster")} />}
        {phase === "question" && (
          <Answering
            q={q}
            qIndex={qIndex}
            total={quiz.questions.length}
            startedAt={startedAt}
            endsAt={endsAt}
            picked={picked}
            left={left}
            onPick={(i) => picked === null && commitAnswer(i)}
            onQuit={finishTurn}
          />
        )}
        {phase === "reveal" && (
          <Reveal
            q={q}
            picked={picked}
            lastGain={lastGain}
            streak={streak}
            isLast={isLast}
            onContinue={continueAfterReveal}
            onQuit={finishTurn}
          />
        )}
        {phase === "turn-done" && (
          <TurnDone
            playerName={name.trim() || "Tanpa nama"}
            score={score}
            rank={rankOf(session.players, score)}
            playerCount={session.players.length}
            streak={streak}
            onNext={startName}
            onBoard={() => setPhase("roster")}
          />
        )}
        {phase === "ended" && <RankMeFinal session={session} sorted={sorted} onBack={() => setPhase("roster")} onDone={startOver} />}
      </main>
    </div>
  );
}

function Roster({
  session,
  sorted,
  onNext,
  onEnd,
}: {
  session: RankMeSession;
  sorted: RankMePlayer[];
  onNext: () => void;
  onEnd: () => void;
}) {
  return (
    <section className="wait">
      <p className="muted">Mode RankMe · bergantian satu perangkat</p>
      <p className="wait-name">{session.quiz.title}</p>
      {sorted.length === 0 ? (
        <p>Serahkan perangkat ini ke murid pertama, lalu ketuk mulai.</p>
      ) : (
        <>
          <p className="muted">{sorted.length} murid sudah main</p>
          <ol className="board-list compact">
            {sorted.map((p) => (
              <li key={p.id} className="board-row">
                <span className="board-rank">{rankOf(session.players, p.score)}</span>
                <span className="board-name">{p.name}</span>
                <span className="board-score">{p.score.toLocaleString("id-ID")}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <div className="dock">
        <button className="btn btn-primary btn-block" onClick={onNext}>
          {sorted.length === 0 ? "Mulai giliran pertama" : "Giliran berikutnya"}
        </button>
        {sorted.length > 0 && (
          <button className="btn btn-ghost btn-block" onClick={onEnd}>
            Akhiri sesi & lihat hasil akhir
          </button>
        )}
      </div>
    </section>
  );
}

function NameForm({
  name,
  setName,
  onSubmit,
  onCancel,
}: {
  name: string;
  setName: (s: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="join-form" onSubmit={onSubmit}>
      <p className="muted">Giliran berikutnya</p>
      <h1 className="display-m">Siapa namamu?</h1>
      <label className="field">
        <span className="field-label">Nama yang tampil di peringkat</span>
        <input
          className="input input-title"
          value={name}
          autoFocus
          autoComplete="off"
          enterKeyHint="go"
          maxLength={LIMITS.name}
          placeholder="Nama kamu"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button className="btn btn-primary btn-block" disabled={!name.trim()}>
        Mulai menjawab
      </button>
      <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
        Batal
      </button>
    </form>
  );
}

function Answering(props: {
  q: RankMeSession["quiz"]["questions"][number];
  qIndex: number;
  total: number;
  startedAt: number;
  endsAt: number;
  picked: number | null;
  left: number;
  onPick: (i: number) => void;
  onQuit: () => void;
}) {
  const { q, picked, left } = props;
  const locked = picked !== null || left === 0;
  return (
    <section className="answering">
      <TimerBar startedAt={props.startedAt} endsAt={props.endsAt} offset={0} running />
      <p className="muted small">
        Soal {props.qIndex + 1} dari {props.total}
      </p>
      <h1 className="q-player">{q.text}</h1>
      <div className="answer-grid" data-count={q.options.length}>
        {q.options.map((o, i) => (
          <button
            key={i}
            className="answer"
            data-opt={i}
            data-state={picked === i ? "picked" : picked !== null ? "dim" : undefined}
            aria-pressed={picked === i}
            disabled={locked}
            onClick={() => {
              vibrate(12);
              sfx("tap");
              props.onPick(i);
            }}
          >
            <Letter i={i} />
            <span className="answer-text">{o}</span>
          </button>
        ))}
      </div>
      <div className="dock">
        <button className="btn btn-ghost btn-sm" onClick={props.onQuit}>
          Akhiri giliran lebih awal
        </button>
      </div>
    </section>
  );
}

function Reveal(props: {
  q: RankMeSession["quiz"]["questions"][number];
  picked: number | null;
  lastGain: number;
  streak: number;
  isLast: boolean;
  onContinue: () => void;
  onQuit: () => void;
}) {
  const { q, picked, lastGain, streak } = props;
  const kind = picked === null ? "none" : picked === q.correct ? "correct" : "wrong";
  const gain = useCountUp(kind === "correct" ? lastGain : 0);

  useEffect(() => {
    if (kind === "correct") {
      vibrate([18, 60, 18]);
      sfx("correct");
      confetti({ count: streak >= 3 ? 150 : 70, y: 0.3 });
      if (streak >= 3) sfx("streak", 0.4);
    } else if (kind === "wrong") {
      vibrate(70);
      sfx("wrong");
    } else {
      sfx("none");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="verdict" data-kind={kind}>
        <div className="stamp-wrap">
          {kind === "correct" && (
            <span className="burst" aria-hidden>
              {Array.from({ length: 8 }, (_, i) => (
                <i key={i} style={{ "--a": `${i * 45}deg` } as React.CSSProperties} />
              ))}
            </span>
          )}
          <p className="stamp">{kind === "correct" ? "Benar!" : kind === "wrong" ? "Belum tepat" : "Tidak menjawab"}</p>
        </div>
        {kind === "correct" && <p className="cheer">{CHEERS[Math.floor(Math.random() * CHEERS.length)]}</p>}
        {kind === "correct" && <p className="gain">+{gain}</p>}
        {kind === "wrong" && <p className="cheer">{COMFORT[Math.floor(Math.random() * COMFORT.length)]}</p>}
        {kind === "correct" && <Streak n={streak} big />}
        <p className="verdict-answer">
          Jawaban benar
          <strong>
            {OPTION_LETTERS[q.correct]}. {q.options[q.correct]}
          </strong>
        </p>
      </section>
      <div className="dock">
        <div className="dock-row">
          <button className="btn btn-ghost" onClick={props.onQuit}>
            Akhiri giliran
          </button>
          <button className="btn btn-primary" onClick={props.onContinue}>
            {props.isLast ? "Lihat hasil giliran" : "Soal berikutnya"}
          </button>
        </div>
      </div>
    </>
  );
}

function TurnDone(props: {
  playerName: string;
  score: number;
  rank: number;
  playerCount: number;
  streak: number;
  onNext: () => void;
  onBoard: () => void;
}) {
  return (
    <section className="standing">
      <p className="muted">Giliran {props.playerName} selesai</p>
      <p className="rank-big">{props.rank}</p>
      <p>
        dari {props.playerCount} peserta, dengan {props.score.toLocaleString("id-ID")} poin
      </p>
      {props.streak >= 2 && <Streak n={props.streak} big />}
      <button className="btn btn-primary btn-block" onClick={props.onNext}>
        Giliran berikutnya
      </button>
      <button className="btn btn-ghost btn-block" onClick={props.onBoard}>
        Lihat daftar peringkat
      </button>
    </section>
  );
}

function RankMeFinal({
  session,
  sorted,
  onBack,
  onDone,
}: {
  session: RankMeSession;
  sorted: RankMePlayer[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [first, second, third] = sorted;
  const placed = Math.min(sorted.length, 3);
  const steps = [
    { p: second, place: 2 },
    { p: first, place: 1 },
    { p: third, place: 3 },
  ];

  useEffect(() => {
    if (placed === 0) return;
    const at = (ms: number, fn: () => void) => setTimeout(fn, ms);
    const timers = [
      placed >= 3 && at(200, () => sfx("pop")),
      placed >= 2 && at(900, () => sfx("pop")),
      at(1600, () => {
        sfx("fanfare");
        confetti({ rain: true, count: 220 });
      }),
      at(3400, () => music("party")),
    ];
    return () => {
      timers.forEach((t) => t && clearTimeout(t));
      music(null);
    };
  }, [placed]);

  return (
    <div className="final">
      <h1 className="display-m">{session.quiz.title}</h1>
      {sorted.length === 0 ? (
        <p className="muted">Belum ada murid yang main di sesi ini.</p>
      ) : (
        <ol className="podium">
          {steps.map(({ p, place }) =>
            p ? (
              <li key={place} className="podium-step" data-place={place}>
                {place === 1 && <Crown />}
                <span className="podium-name">{p.name}</span>
                <span className="podium-score">{p.score.toLocaleString("id-ID")}</span>
                <span className="podium-block">{place}</span>
              </li>
            ) : (
              <li key={place} className="podium-step podium-empty" data-place={place} aria-hidden />
            ),
          )}
        </ol>
      )}
      {sorted.length > 3 && (
        <ol className="board-list compact" start={4}>
          {sorted.slice(3).map((p, i) => (
            <li key={p.id} className="board-row">
              <span className="board-rank">{i + 4}</span>
              <span className="board-name">{p.name}</span>
              <span className="board-score">{p.score.toLocaleString("id-ID")}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="dock">
        <p className="dock-note" role="status">
          {sorted.length} murid sudah main. Kuis ini masih tersimpan kalau mau menambah giliran lagi.
        </p>
        <div className="dock-row">
          <button className="btn btn-ghost" disabled={sorted.length === 0} onClick={() => downloadRankMeCsv(session, sorted)}>
            Unduh nilai (CSV)
          </button>
          <button className="btn btn-ghost" onClick={onBack}>
            Tambah giliran
          </button>
        </div>
        <Link className="btn btn-primary btn-block" href="/buat" onClick={onDone}>
          Selesai, kembali ke kuis saya
        </Link>
      </div>
    </div>
  );
}

function downloadRankMeCsv(session: RankMeSession, sorted: RankMePlayer[]) {
  // Semicolons because Excel with Indonesian regional settings splits on them.
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["Peringkat", "Nama", "Skor", "Benar", ...session.quiz.questions.map((_, i) => `Soal ${i + 1}`)];
  const rows = sorted.map((p) => [
    rankOf(session.players, p.score),
    p.name,
    p.score,
    p.results.filter((r) => r !== null && r > 0).length,
    ...p.results.map((r) => (r === null ? "-" : r)),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${session.quiz.title.replace(/[^\w\- ]+/g, "").trim() || "rankme"}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
