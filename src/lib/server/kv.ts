import { Redis } from "@upstash/redis";

// The handful of Redis commands the room engine needs. On Vercel this is Upstash Redis,
// shared by every function instance. Without credentials (local dev, a single `pnpm start`
// on a classroom laptop) it falls back to process memory, which is fine for one process.

export interface KV {
  get<T>(key: string): Promise<T | null>;
  /** Returns false when `nx` is set and the key already exists. */
  set(key: string, value: unknown, opts: { ex: number; nx?: boolean }): Promise<boolean>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hset(key: string, values: Record<string, unknown>): Promise<void>;
  /** Returns false when the field already exists. */
  hsetnx(key: string, field: string, value: unknown): Promise<boolean>;
  hdel(key: string, field: string): Promise<void>;
  hlen(key: string): Promise<number>;
}

function upstash(url: string, token: string): KV {
  const r = new Redis({ url, token, enableAutoPipelining: true });
  return {
    get: (k) => r.get(k),
    set: async (k, v, o) => (await (o.nx ? r.set(k, v, { ex: o.ex, nx: true }) : r.set(k, v, { ex: o.ex }))) === "OK",
    incr: (k) => r.incr(k),
    expire: async (k, s) => void (await r.expire(k, s)),
    hgetall: async <T>(k: string) => ((await r.hgetall<Record<string, T>>(k)) ?? {}),
    hget: (k, f) => r.hget(k, f),
    hset: async (k, v) => void (await r.hset(k, v)),
    hsetnx: async (k, f, v) => (await r.hsetnx(k, f, v)) === 1,
    hdel: async (k, f) => void (await r.hdel(k, f)),
    hlen: (k) => r.hlen(k),
  };
}

function memory(): KV {
  type Entry = { value: unknown; expires: number };
  const data = new Map<string, Entry>();
  const live = (k: string) => {
    const e = data.get(k);
    if (e && e.expires < Date.now()) data.delete(k);
    return data.get(k);
  };
  const hash = (k: string, create = false) => {
    let e = live(k);
    if (!e && create) data.set(k, (e = { value: {}, expires: Infinity }));
    return e?.value as Record<string, unknown> | undefined;
  };
  // Clone on the way in and out so callers can't share references, like a real network store.
  const copy = <T>(v: T): T => structuredClone(v);

  return {
    get: async (k) => copy((live(k)?.value ?? null) as never),
    set: async (k, v, o) => {
      if (o.nx && live(k)) return false;
      data.set(k, { value: copy(v), expires: Date.now() + o.ex * 1000 });
      return true;
    },
    incr: async (k) => {
      const e = live(k);
      const n = Number(e?.value ?? 0) + 1;
      data.set(k, { value: n, expires: e?.expires ?? Infinity });
      return n;
    },
    expire: async (k, s) => {
      const e = live(k);
      if (e) e.expires = Date.now() + s * 1000;
    },
    hgetall: async (k) => copy((hash(k) ?? {}) as never),
    hget: async (k, f) => copy((hash(k)?.[f] ?? null) as never),
    hset: async (k, v) => void Object.assign(hash(k, true)!, copy(v)),
    hsetnx: async (k, f, v) => {
      const h = hash(k, true)!;
      if (f in h) return false;
      h[f] = copy(v);
      return true;
    },
    hdel: async (k, f) => void delete hash(k)?.[f],
    hlen: async (k) => Object.keys(hash(k) ?? {}).length,
  };
}

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const g = globalThis as unknown as { __qkKv?: KV };
export const kv: KV = (g.__qkKv ??= url && token ? upstash(url, token) : memory());
export const usingRedis = Boolean(url && token);
