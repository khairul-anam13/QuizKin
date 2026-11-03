// Margin doodles, as if drawn in ballpoint on the exercise book. Purely decorative.

const SHAPES = {
  star: <path d="M24 4l5.6 12.6 13.8 1.4-10.4 9.3 3 13.5L24 33.8 12 40.8l3-13.5L4.6 18l13.8-1.4z" fill="var(--opt-0)" />,
  heart: <path d="M24 40C10 31 4.5 23 8 15c3.5-7.5 12.5-7 16 .5 3.5-7.5 12.5-8 16-.5 3.5 8-2 16-16 25z" fill="var(--opt-1)" />,
  bolt: <path d="M27 4L12 27h11l-4 17 17-25H25z" fill="var(--opt-0)" />,
  sparkle: <path d="M24 4q2 18 20 20-18 2-20 20-2-18-20-20 18-2 20-20z" fill="var(--opt-3)" />,
  planet: (
    <>
      <circle cx="24" cy="24" r="11" fill="var(--opt-2)" />
      <path d="M8 31c-6 4.5-4 7 4 5 7-1.8 16-6.6 24-12.4S47 13 42 13.5" fill="none" />
    </>
  ),
  plane: (
    <>
      <path d="M4 22L44 6 31 42l-8-14z" fill="#fff" />
      <path d="M23 28L44 6" fill="none" />
    </>
  ),
  smile: (
    <>
      <circle cx="24" cy="24" r="18" fill="var(--opt-0)" />
      <path d="M17 20v2M31 20v2M16 29q8 7 16 0" fill="none" />
    </>
  ),
  squiggle: <path d="M4 30q6-14 12 0t12 0 12 0" fill="none" />,
  swirl: <path d="M24 24c0-3 4-3 4 0 0 5-8 5-8 0 0-7 12-7 12 0 0 9-16 9-16 0 0-11 20-11 20 0" fill="none" />,
};
type Shape = keyof typeof SHAPES;

// [shape, x%, y%, size px, rotation°, hideOnPhones]
type Spot = [Shape, number, number, number, number, boolean?];

const SETS: Record<string, Spot[]> = {
  home: [
    ["star", 84, 6, 40, 12],
    ["planet", 3, 34, 44, -10, true],
    ["heart", 88, 44, 34, 14, true],
    ["sparkle", 6, 78, 32, 0],
    ["plane", 82, 86, 46, -8],
  ],
  lobby: [
    ["star", 3, 16, 46, -12],
    ["plane", 90, 12, 54, 6],
    ["planet", 2, 62, 52, 10, true],
    ["smile", 92, 52, 44, -8, true],
    ["sparkle", 46, 92, 30, 0, true],
    ["bolt", 6, 90, 38, 12],
    ["heart", 90, 88, 36, -14],
  ],
  wait: [
    ["star", 5, 52, 36, -12],
    ["plane", 82, 44, 44, 6],
    ["smile", 8, 82, 38, 10],
    ["sparkle", 84, 76, 30, 0],
    ["swirl", 46, 88, 34, 0, true],
  ],
  cheer: [
    ["star", 4, 14, 44, -12],
    ["sparkle", 90, 10, 36, 8],
    ["bolt", 3, 58, 40, 14, true],
    ["star", 92, 48, 34, 18, true],
    ["heart", 7, 88, 36, -10],
    ["squiggle", 86, 90, 44, 0],
  ],
};

export function Doodles({ set }: { set: keyof typeof SETS }) {
  return (
    <div className="doodles" aria-hidden>
      {SETS[set].map(([shape, x, y, size, rot, hide], i) => (
        <svg
          key={i}
          viewBox="0 0 48 48"
          className="doodle"
          data-hide-sm={hide || undefined}
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, "--rot": `${rot}deg`, "--i": i } as React.CSSProperties}
        >
          {SHAPES[shape]}
        </svg>
      ))}
    </div>
  );
}
