"use client";

const COLORS = ["#ffd23f", "#ff94c9", "#6dcfff", "#8fe384", "#2233b8"];
const LIFE_MS = 2600;

type Opts = {
  count?: number;
  /** Burst origin as a fraction of the viewport. Ignored when `rain` is set. */
  x?: number;
  y?: number;
  /** Fall from the top edge across the whole width instead of bursting from a point. */
  rain?: boolean;
};

/** A one-shot paper confetti burst on a throwaway canvas. Skipped for reduced motion. */
export function confetti({ count = 80, x = 0.5, y = 0.35, rain = false }: Opts = {}) {
  if (typeof window === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const W = innerWidth;
  const H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  document.body.appendChild(canvas);
  const c = canvas.getContext("2d")!;
  c.scale(dpr, dpr);

  const power = Math.min(1.3, 0.55 + W / 900);
  const parts = Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.85;
    const speed = (6 + Math.random() * 9) * power;
    return {
      x: rain ? Math.random() * W : x * W,
      y: rain ? -20 - Math.random() * H * 0.4 : y * H,
      vx: rain ? (Math.random() - 0.5) * 2 : Math.cos(angle) * speed,
      vy: rain ? 2 + Math.random() * 3 : Math.sin(angle) * speed,
      spin: Math.random() * Math.PI,
      vspin: (Math.random() - 0.5) * 0.3,
      size: 7 + Math.random() * 7,
      color: COLORS[i % COLORS.length],
      round: i % 4 === 0,
    };
  });

  const start = performance.now();
  let last = start;
  const frame = (now: number) => {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    const age = now - start;
    c.clearRect(0, 0, W, H);
    c.globalAlpha = Math.min(1, (LIFE_MS - age) / 500);
    for (const p of parts) {
      p.vy += 0.3 * dt;
      p.vx *= 0.985 ** dt;
      p.vy *= 0.985 ** dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.spin += p.vspin * dt;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.spin);
      c.fillStyle = p.color;
      if (p.round) {
        c.beginPath();
        c.arc(0, 0, p.size / 2.6, 0, Math.PI * 2);
        c.fill();
      } else {
        // Scaling one axis by cos(spin) makes the strip look like it flutters.
        c.scale(1, Math.cos(p.spin * 2));
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      c.restore();
    }
    if (age < LIFE_MS) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
