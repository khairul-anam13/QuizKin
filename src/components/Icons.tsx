export function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="check">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function Cross() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="check">
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function Flame() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="flame">
      <path d="M12 2.5c1 3.5 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2.6 1.4-4.2 2.6-5.4.2 1.8 1 2.9 2 3.4-.4-3.2-.1-6.2.9-9z" />
      <path className="flame-core" d="M12 12.5c.6 1.6 2.4 2.4 2.4 4.4a2.4 2.4 0 0 1-4.8 0c0-1.5 1.2-2.6 2.4-4.4z" />
    </svg>
  );
}

export function Crown() {
  return (
    <svg viewBox="0 0 48 32" aria-hidden className="crown">
      <path d="M5 27L3 7l11 9 10-13 10 13 11-9-2 20z" />
      <circle cx="24" cy="18" r="2.6" />
    </svg>
  );
}

export function Medal({ place }: { place: number }) {
  return (
    <svg viewBox="0 0 48 64" aria-hidden className="medal" data-place={place}>
      <path className="medal-ribbon" d="M12 2h9l7 22h-9zM36 2h-9l-7 22h9z" />
      <circle className="medal-disc" cx="24" cy="42" r="17" />
      <text x="24" y="49" textAnchor="middle">
        {place}
      </text>
    </svg>
  );
}

export function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {on ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" />}
    </svg>
  );
}
