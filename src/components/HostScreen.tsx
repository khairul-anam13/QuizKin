"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { api, hostKeyFor, store, useRoomStream } from "@/lib/client";
import type { HostView, PlayerRow } from "@/lib/types";
import { Connecting, Letter, Movement, Notice, Offline, TimerBar } from "./GameParts";
import { Check } from "./Icons";

export function HostScreen({ code }: { code: string }) {
  const [hostKey, setHostKey] = useState<string | null | undefined>(undefined);
  useEffect(() => setHostKey(store.get<string>(hostKeyFor(code))), [code]);

  const query = hostKey ? `host=${encodeURIComponent(hostKey)}` : null;
  const { view, gone, online, offset } = useRoomStream<HostView>(code, query);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rooms/${code}`, { action, hostKey, ...extra });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (hostKey === undefined) return <Connecting />;
  if (hostKey === null || gone) {
    return (
      <Notice title={gone ? "Ruangan sudah ditutup" : "Ruangan ini dikendalikan dari perangkat lain"}>
        <p>
          {gone
            ? "Sesi ini sudah berakhir atau terlalu lama tidak dipakai."
            : "Hanya browser yang membuka ruangan ini yang bisa mengendalikannya. Kalau kamu peserta, masuk lewat halaman utama."}
        </p>
        <Link className="btn btn-primary" href="/buat">
          Ke kuis saya
        </Link>
      </Notice>
    );
  }
  if (!view) return <Connecting />;

  const playing = view.phase === "question" || view.phase === "reveal" || view.phase === "leaderboard";

  return (
    <div className="host" data-phase={view.phase}>
      <Offline online={online} />
      <header className="host-bar">
        <span className="host-code" aria-label={`Kode ruangan ${code}`}>
          {code}
        </span>
        {playing && (
          <span className="host-progress">
            Soal {view.qIndex + 1} dari {view.total}
          </span>
        )}
        <span className="host-count">{view.players.length} peserta</span>
        {playing && <EndButton onEnd={() => act("end")} disabled={busy} />}
      </header>

      <main className="host-stage">
        {view.phase === "lobby" && <Lobby view={view} onKick={(pid) => act("kick", { pid })} />}
        {view.phase === "question" && <QuestionStage view={view} offset={offset} />}
        {view.phase === "reveal" && <RevealStage view={view} />}
        {view.phase === "leaderboard" && <Leaderboard players={view.players} />}
        {view.phase === "ended" && <Final view={view} />}
      </main>

      <footer className="dock">
        {error && (
          <p className="dock-note error" role="alert">
            {error}
          </p>
        )}
        <DockAction view={view} busy={busy} act={act} />
      </footer>
    </div>
  );
}

function DockAction({ view, busy, act }: { view: HostView; busy: boolean; act: (a: string) => void }) {
  switch (view.phase) {
    case "lobby":
      return (
        <button className="btn btn-primary btn-block" disabled={busy || view.players.length === 0} onClick={() => act("start")}>
          {view.players.length === 0 ? "Menunggu peserta" : `Mulai kuis dengan ${view.players.length} peserta`}
        </button>
      );
    case "question":
      return (
        <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act("reveal")}>
          Tutup soal dan tampilkan jawaban
        </button>
      );
    case "reveal":
      return (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => act("next")}>
          {view.qIndex + 1 >= view.total ? "Lihat hasil akhir" : "Lihat peringkat"}
        </button>
      );
    case "leaderboard":
      return (
        <button className="btn btn-primary btn-block" disabled={busy} onClick={() => act("next")}>
          Soal berikutnya
        </button>
      );
    case "ended":
      return (
        <div className="dock-row">
          <button className="btn btn-ghost" onClick={() => downloadCsv(view)}>
            Unduh nilai (CSV)
          </button>
          <Link className="btn btn-primary" href="/buat">
            Selesai
          </Link>
        </div>
      );
  }
}

function EndButton({ onEnd, disabled }: { onEnd: () => void; disabled: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={armed ? "btn btn-sm btn-danger" : "btn btn-sm btn-ghost"}
      disabled={disabled}
      onClick={() => (armed ? onEnd() : setArmed(true))}
    >
      {armed ? "Ketuk lagi untuk mengakhiri" : "Akhiri"}
    </button>
  );
}

function Lobby({ view, onKick }: { view: HostView; onKick: (pid: string) => void }) {
  const joinUrl = `${location.origin}/${view.code}`;
  const qr = useMemo(() => renderSVG(joinUrl, { border: 1 }), [joinUrl]);

  return (
    <div className="lobby">
      <section className="lobby-join">
        <h1 className="lobby-title">{view.title}</h1>
        <p className="lobby-how">
          Buka <strong>{location.host}</strong> di HP lalu masukkan kode
        </p>
        <p className="big-code" aria-label={`Kode ${view.code.split("").join(" ")}`}>
          {view.code.slice(0, 3)}
          <span>{view.code.slice(3)}</span>
        </p>
        <div className="qr" aria-label="Kode QR untuk bergabung" dangerouslySetInnerHTML={{ __html: qr }} />
      </section>

      <section className="lobby-players" aria-live="polite">
        {view.players.length === 0 ? (
          <p className="muted waiting">Nama peserta akan muncul di sini begitu mereka masuk.</p>
        ) : (
          <ul className="chips">
            {view.players.map((p) => (
              <li key={p.id} className="chip" data-online={p.online}>
                <span>{p.name}</span>
                <button className="chip-x" aria-label={`Keluarkan ${p.name}`} onClick={() => onKick(p.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function QuestionStage({ view, offset }: { view: HostView; offset: number }) {
  const q = view.question!;
  return (
    <div className="stage">
      <TimerBar startedAt={view.startedAt} endsAt={view.endsAt} offset={offset} running />
      <h1 className="q-display">{q.text}</h1>
      <ul className="opt-grid" data-count={q.options.length}>
        {q.options.map((o, i) => (
          <li key={i} className="opt-tile" data-opt={i}>
            <Letter i={i} />
            <span className="opt-text">{o}</span>
          </li>
        ))}
      </ul>
      <p className="answer-count" aria-live="polite">
        <strong>{view.answerCount}</strong> dari {view.players.length} sudah menjawab
      </p>
    </div>
  );
}

function RevealStage({ view }: { view: HostView }) {
  const q = view.question!;
  const max = Math.max(1, ...view.distribution);
  const total = view.distribution.reduce((a, b) => a + b, 0);
  const right = view.distribution[q.correct] ?? 0;

  return (
    <div className="stage">
      <h1 className="q-display q-display-sm">{q.text}</h1>
      <ul className="opt-grid reveal" data-count={q.options.length}>
        {q.options.map((o, i) => (
          <li key={i} className="opt-tile" data-opt={i} data-result={i === q.correct ? "correct" : "wrong"}>
            <span
              className="opt-bar"
              style={{ transform: `scaleX(${view.distribution[i] / max})` }}
              aria-hidden
            />
            {i === q.correct ? (
              <span className="opt-letter" data-opt={i} aria-label="Jawaban benar">
                <Check />
              </span>
            ) : (
              <Letter i={i} />
            )}
            <span className="opt-text">{o}</span>
            <span className="opt-count">{view.distribution[i]}</span>
          </li>
        ))}
      </ul>
      <p className="answer-count">
        {total === 0
          ? "Tidak ada yang menjawab soal ini."
          : `${right} dari ${view.players.length} peserta menjawab benar.`}
      </p>
    </div>
  );
}

function Leaderboard({ players }: { players: PlayerRow[] }) {
  return (
    <div className="board">
      <h1 className="display-m">Peringkat sementara</h1>
      <ol className="board-list">
        {players.slice(0, 10).map((p) => (
          <li key={p.id} className="board-row" data-top={p.rank <= 3}>
            <span className="board-rank">{p.rank}</span>
            <span className="board-name">
              {p.name}
              {p.streak >= 3 && <span className="streak">{p.streak} benar beruntun</span>}
            </span>
            <Movement prev={p.prevRank} now={p.rank} />
            <span className="board-score">
              {p.score.toLocaleString("id-ID")}
              {p.lastGain > 0 && <small>+{p.lastGain}</small>}
            </span>
          </li>
        ))}
      </ol>
      {players.length > 10 && <p className="muted">dan {players.length - 10} peserta lainnya</p>}
    </div>
  );
}

function Final({ view }: { view: HostView }) {
  const [first, second, third] = view.players;
  const steps = [
    { p: second, place: 2 },
    { p: first, place: 1 },
    { p: third, place: 3 },
  ];

  return (
    <div className="final">
      <h1 className="display-m">{view.title}</h1>
      {view.players.length === 0 ? (
        <p className="muted">Tidak ada peserta di sesi ini.</p>
      ) : (
        <ol className="podium">
          {steps.map(({ p, place }) =>
            p ? (
              <li key={place} className="podium-step" data-place={place}>
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
      {view.players.length > 3 && (
        <ol className="board-list compact" start={4}>
          {view.players.slice(3).map((p) => (
            <li key={p.id} className="board-row">
              <span className="board-rank">{p.rank}</span>
              <span className="board-name">{p.name}</span>
              <span className="board-score">{p.score.toLocaleString("id-ID")}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function downloadCsv(view: HostView) {
  // Semicolons because Excel with Indonesian regional settings splits on them.
  const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const header = ["Peringkat", "Nama", "Skor", "Benar", ...view.questions.map((_, i) => `Soal ${i + 1}`)];
  const rows = view.players.map((p) => [
    p.rank,
    p.name,
    p.score,
    p.results.filter((r) => r !== null && r > 0).length,
    ...p.results.map((r) => (r === null ? "-" : r)),
  ]);
  const csv = "﻿" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${view.title.replace(/[^\w\- ]+/g, "").trim() || "kuis"}-${view.code}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
