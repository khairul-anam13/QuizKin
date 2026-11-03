"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, type Seat, seatKeyFor, store, useRoomStream, useSecondsLeft, vibrate } from "@/lib/client";
import { LIMITS, OPTION_LETTERS } from "@/lib/quiz";
import type { PlayerView } from "@/lib/types";
import { Connecting, Letter, Movement, Notice, Offline, TimerBar } from "./GameParts";

const NAME_KEY = "qk:name";

export function PlayerScreen({ code }: { code: string }) {
  const [seat, setSeat] = useState<Seat | null | undefined>(undefined);
  useEffect(() => setSeat(store.get<Seat>(seatKeyFor(code))), [code]);

  const query = seat ? `pid=${seat.pid}&token=${seat.token}` : null;
  const { view, gone, online, offset } = useRoomStream<PlayerView>(code, query);

  if (seat === undefined) return <Connecting />;

  if (gone) {
    const rejoin = () => {
      store.remove(seatKeyFor(code));
      setSeat(null);
    };
    return gone === "kicked" ? (
      <Notice title="Kamu tidak lagi di ruangan ini">
        <p>Pengajar mengeluarkanmu dari ruangan, atau sesimu sudah tidak berlaku.</p>
        <button className="btn btn-primary" onClick={rejoin}>
          Masuk lagi
        </button>
      </Notice>
    ) : (
      <Notice title="Ruangan sudah ditutup">
        <p>Sesi kuis ini sudah berakhir. Minta kode baru ke pengajarmu.</p>
        <Link className="btn btn-primary" href="/">
          Ke beranda
        </Link>
      </Notice>
    );
  }

  if (!seat) {
    return (
      <JoinForm
        code={code}
        onJoined={(s) => {
          store.set(seatKeyFor(code), s);
          setSeat(s);
        }}
      />
    );
  }

  if (!view) return <Connecting />;

  return (
    <div className="player" data-phase={view.phase}>
      <Offline online={online} />
      <header className="player-bar">
        <span className="player-name">{view.me.name}</span>
        <span className="score-pill" aria-label={`Skor ${view.me.score}`}>
          {view.me.score.toLocaleString("id-ID")}
        </span>
      </header>
      <main className="player-stage">
        {view.phase === "lobby" && <Waiting view={view} />}
        {view.phase === "question" && <Answering key={view.qIndex} view={view} seat={seat} offset={offset} />}
        {view.phase === "reveal" && <Verdict key={view.qIndex} view={view} />}
        {view.phase === "leaderboard" && <Standing view={view} />}
        {view.phase === "ended" && <FinalCard view={view} />}
      </main>
    </div>
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (s: Seat) => void }) {
  const [info, setInfo] = useState<{ title: string; phase: string } | "missing" | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(store.get<string>(NAME_KEY) ?? "");
    api<{ title: string; phase: string }>(`/api/rooms/${code}`)
      .then(setInfo)
      .catch(() => setInfo("missing"));
  }, [code]);

  if (info === null) return <Connecting />;
  if (info === "missing" || info.phase === "ended") {
    return (
      <Notice title={info === "missing" ? "Kode tidak ditemukan" : "Kuis ini sudah selesai"}>
        <p>
          {info === "missing"
            ? `Tidak ada ruangan dengan kode ${code}. Cek lagi angka di layar pengajarmu.`
            : "Ruangan masih terbuka, tapi kuisnya sudah berakhir. Minta kode baru ke pengajarmu."}
        </p>
        <Link className="btn btn-primary" href="/">
          Masukkan kode lain
        </Link>
      </Notice>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const seat = await api<Seat>(`/api/rooms/${code}`, { action: "join", name });
      store.set(NAME_KEY, name.trim());
      onJoined(seat);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form className="join-form" onSubmit={submit}>
      <p className="muted">Ruangan {code}</p>
      <h1 className="display-m">{info.title}</h1>
      {info.phase !== "lobby" && <p className="note">Kuis sudah dimulai. Kamu tetap bisa ikut dari soal berikutnya.</p>}
      <label className="field">
        <span className="field-label">Nama yang tampil di layar</span>
        <input
          className="input input-title"
          value={name}
          autoFocus
          autoComplete="nickname"
          enterKeyHint="go"
          maxLength={LIMITS.name}
          placeholder="Nama kamu"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary btn-block" disabled={!name.trim() || busy}>
        {busy ? "Masuk…" : "Masuk ruangan"}
      </button>
    </form>
  );
}

function Waiting({ view }: { view: PlayerView }) {
  return (
    <section className="wait">
      <p className="wait-name">{view.me.name}</p>
      <p>Kamu sudah masuk. Cari namamu di layar kelas.</p>
      <p className="muted">
        {view.playerCount} peserta di ruangan. Kuis dimulai saat pengajar siap.
      </p>
      <span className="dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </section>
  );
}

function Answering({ view, seat, offset }: { view: PlayerView; seat: Seat; offset: number }) {
  const q = view.question!;
  const [picked, setPicked] = useState<number | null>(view.me.choice);
  const [error, setError] = useState<string | null>(null);
  const left = useSecondsLeft(view.endsAt, offset, true);
  const locked = picked !== null || left === 0;

  const pick = async (choice: number) => {
    if (locked) return;
    setPicked(choice); // optimistic: the tap should feel instant
    setError(null);
    vibrate(12);
    try {
      await api(`/api/rooms/${view.code}`, { action: "answer", ...seat, qIndex: view.qIndex, choice });
    } catch (e) {
      setPicked(null);
      setError((e as Error).message);
    }
  };

  return (
    <section className="answering">
      <TimerBar startedAt={view.startedAt} endsAt={view.endsAt} offset={offset} running />
      <p className="muted small">
        Soal {view.qIndex + 1} dari {view.total}
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
            onClick={() => pick(i)}
          >
            <Letter i={i} />
            <span className="answer-text">{o}</span>
          </button>
        ))}
      </div>
      <p className="answer-status" role="status">
        {error ?? (picked !== null ? "Jawaban terkirim. Tunggu yang lain." : left === 0 ? "Waktu habis." : "")}
      </p>
    </section>
  );
}

function Verdict({ view }: { view: PlayerView }) {
  const q = view.question!;
  const { choice, lastGain, streak, rank } = view.me;
  const kind = choice === null ? "none" : choice === q.correct ? "correct" : "wrong";

  useEffect(() => {
    if (kind === "correct") vibrate([18, 60, 18]);
    else if (kind === "wrong") vibrate(70);
  }, [kind]);

  return (
    <section className="verdict" data-kind={kind}>
      <p className="stamp">{kind === "correct" ? "Benar" : kind === "wrong" ? "Belum tepat" : "Tidak menjawab"}</p>
      {kind === "correct" && <p className="gain">+{lastGain}</p>}
      <p className="verdict-answer">
        Jawaban benar
        <strong>
          {OPTION_LETTERS[q.correct]}. {q.options[q.correct]}
        </strong>
      </p>
      {streak >= 2 && <p className="streak">{streak} benar beruntun</p>}
      <p className="muted">
        Peringkat {rank} dari {view.playerCount}
      </p>
    </section>
  );
}

function Standing({ view }: { view: PlayerView }) {
  const { rank, prevRank, score } = view.me;
  return (
    <section className="standing">
      <p className="muted">Posisimu sekarang</p>
      <p className="rank-big">
        {rank}
        <Movement prev={prevRank} now={rank} />
      </p>
      <p>
        dari {view.playerCount} peserta, dengan {score.toLocaleString("id-ID")} poin
      </p>
      <p className="muted small">Soal berikutnya muncul saat pengajar melanjutkan.</p>
    </section>
  );
}

function FinalCard({ view }: { view: PlayerView }) {
  const { rank, score } = view.me;
  const line =
    rank === 1 ? "Juara sesi ini. Selamat!" : rank <= 3 ? "Masuk tiga besar. Mantap!" : "Terima kasih sudah ikut.";
  return (
    <section className="final-card">
      <p className="muted">Hasil akhir</p>
      <p className="rank-big">{rank}</p>
      <p className="final-line">{line}</p>
      <p>
        {score.toLocaleString("id-ID")} poin, peringkat {rank} dari {view.playerCount}
      </p>
      <ol className="mini-podium">
        {view.podium.map((p, i) => (
          <li key={i} data-me={p.name === view.me.name}>
            <span>{i + 1}</span>
            {p.name}
            <strong>{p.score.toLocaleString("id-ID")}</strong>
          </li>
        ))}
      </ol>
      <Link className="btn btn-ghost btn-block" href="/">
        Ke beranda
      </Link>
    </section>
  );
}
