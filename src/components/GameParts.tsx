"use client";

import { useRef } from "react";
import { useSecondsLeft } from "@/lib/client";
import { OPTION_LETTERS } from "@/lib/quiz";

export function TimerBar(props: { startedAt: number; endsAt: number; offset: number; running: boolean }) {
  const { startedAt, endsAt, offset, running } = props;
  const left = useSecondsLeft(endsAt, offset, running);
  const total = endsAt - startedAt;
  // Measured once per question: re-reading it each tick would push the running animation forward.
  const first = useRef({ startedAt: -1, elapsed: 0 });
  if (first.current.startedAt !== startedAt) {
    first.current = { startedAt, elapsed: Math.min(Math.max(Date.now() + offset - startedAt, 0), total) };
  }
  const elapsed = first.current.elapsed;

  return (
    <div className="timer" data-urgent={running && left <= 5}>
      <span className="timer-num" aria-label={`${left} detik tersisa`}>
        {running ? left : 0}
      </span>
      <span className="timer-track" aria-hidden>
        {/* The bar is a single CSS animation; negative delay resumes it mid-way after a reconnect. */}
        <span
          key={startedAt}
          className="timer-fill"
          style={
            running
              ? { animationDuration: `${total}ms`, animationDelay: `-${elapsed}ms` }
              : { animation: "none", transform: "scaleX(0)" }
          }
        />
      </span>
    </div>
  );
}

export function Letter({ i }: { i: number }) {
  return (
    <span className="opt-letter" data-opt={i} aria-hidden>
      {OPTION_LETTERS[i]}
    </span>
  );
}

export function Movement({ prev, now }: { prev: number; now: number }) {
  const diff = prev - now;
  if (!prev || diff === 0) return <span className="move move-flat" aria-label="Posisi tetap" />;
  return (
    <span className={diff > 0 ? "move move-up" : "move move-down"} aria-label={`${diff > 0 ? "Naik" : "Turun"} ${Math.abs(diff)}`}>
      {diff > 0 ? "▲" : "▼"}
      {Math.abs(diff)}
    </span>
  );
}

export function Offline({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div className="offline" role="status">
      Koneksi terputus. Menyambung ulang…
    </div>
  );
}

export function Notice(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="notice">
      <h1 className="display-m">{props.title}</h1>
      <div className="notice-body">{props.children}</div>
    </section>
  );
}

export function Connecting() {
  return (
    <div className="connecting" role="status">
      <span className="dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
      Menghubungkan ke ruangan
    </div>
  );
}
