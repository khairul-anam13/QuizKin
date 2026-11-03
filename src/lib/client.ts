"use client";

import { useEffect, useRef, useState } from "react";
import type { HostView, PlayerView, RoomEvent } from "./types";

export async function api<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, body === undefined ? undefined : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) throw new Error("Tidak ada koneksi. Periksa internetmu lalu coba lagi.");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Terjadi kesalahan di server. Coba lagi.");
  return data as T;
}

// localStorage can throw (private mode, blocked storage), so every access is guarded.
export const store = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

export const hostKeyFor = (code: string) => `qk:host:${code}`;
export const seatKeyFor = (code: string) => `qk:seat:${code}`;
export type Seat = { pid: string; token: string };

type Stream<V> = {
  view: V | null;
  gone: "kicked" | "closed" | null;
  online: boolean;
  offset: number; // serverNow - clientNow
};

/** Subscribes to a room's event stream. Pass `null` to stay idle. */
export function useRoomStream<V extends HostView | PlayerView>(code: string, query: string | null): Stream<V> {
  const [state, setState] = useState<Stream<V>>({ view: null, gone: null, online: true, offset: 0 });

  useEffect(() => {
    if (query === null) return;
    let es: EventSource;
    const open = () => {
      es = new EventSource(`/api/rooms/${code}/events?${query}`);
      es.onopen = () => setState((s) => ({ ...s, online: true }));
      es.onerror = () => setState((s) => ({ ...s, online: false }));
      es.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as RoomEvent;
        if (event.type === "renew") {
          // Planned hand-over to a fresh stream; swap quietly instead of flashing "offline".
          es.close();
          open();
        } else if (event.type === "gone") {
          es.close();
          setState((s) => ({ ...s, gone: event.reason }));
        } else {
          setState({ view: event.view as V, gone: null, online: true, offset: event.view.now - Date.now() });
        }
      };
    };
    open();
    return () => es.close();
  }, [code, query]);

  return state;
}

/** Seconds left until `endsAt` on the server clock, ticking a few times per second. */
export function useSecondsLeft(endsAt: number, offset: number, active: boolean) {
  const calc = () => Math.max(0, Math.ceil((endsAt - (Date.now() + offset)) / 1000));
  const [left, setLeft] = useState(calc);
  const calcRef = useRef(calc);
  calcRef.current = calc;

  useEffect(() => {
    setLeft(calcRef.current());
    if (!active) return;
    const id = setInterval(() => setLeft(calcRef.current()), 200);
    return () => clearInterval(id);
  }, [endsAt, offset, active]);

  return left;
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {}
}
