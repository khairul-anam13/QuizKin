import type { Question, Quiz } from "./types";

export const LIMITS = {
  title: 80,
  question: 240,
  option: 90,
  questions: 50,
  name: 18,
  players: 300,
} as const;

export const TIME_CHOICES = [10, 20, 30, 60, 90] as const;
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export function emptyQuestion(): Question {
  return { text: "", options: ["", "", "", ""], correct: 0, time: 20 };
}

/** Returns a human-readable problem, or null when the quiz can be played. */
export function quizProblem(quiz: Quiz): string | null {
  if (!quiz.title.trim()) return "Beri judul kuis dulu.";
  if (quiz.questions.length === 0) return "Tambahkan minimal satu soal.";
  if (quiz.questions.length > LIMITS.questions) return `Maksimal ${LIMITS.questions} soal.`;
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    const filled = q.options.filter((o) => o.trim());
    if (!q.text.trim()) return `Soal ${i + 1} belum ada pertanyaannya.`;
    if (filled.length < 2) return `Soal ${i + 1} butuh minimal dua pilihan jawaban.`;
    if (!q.options[q.correct]?.trim()) return `Soal ${i + 1}: tandai jawaban yang benar.`;
  }
  return null;
}

/** Trims, clamps and drops empty options so the server can trust the shape. */
export function sanitizeQuiz(input: unknown): Quiz | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as { title?: unknown; questions?: unknown };
  if (typeof raw.title !== "string" || !Array.isArray(raw.questions)) return null;

  const questions: Question[] = [];
  for (const rq of raw.questions.slice(0, LIMITS.questions)) {
    if (!rq || typeof rq !== "object") return null;
    const { text, options, correct, time } = rq as Record<string, unknown>;
    if (typeof text !== "string" || !Array.isArray(options)) return null;
    if (typeof correct !== "number" || typeof time !== "number") return null;

    // Drop blank options but keep track of where the correct one lands.
    const kept: string[] = [];
    let newCorrect = -1;
    options.slice(0, 4).forEach((o, i) => {
      if (typeof o !== "string" || !o.trim()) return;
      if (i === correct) newCorrect = kept.length;
      kept.push(o.trim().slice(0, LIMITS.option));
    });
    questions.push({
      text: text.trim().slice(0, LIMITS.question),
      options: kept,
      correct: newCorrect,
      time: TIME_CHOICES.includes(time as never) ? time : 20,
    });
  }

  const quiz = { title: raw.title.trim().slice(0, LIMITS.title), questions };
  const valid = questions.every((q) => q.text && q.options.length >= 2 && q.correct >= 0);
  return valid && quiz.title && questions.length ? quiz : null;
}

/** Faster correct answers earn more: 1000 for an instant answer, 500 at the final second. */
export function scoreFor(elapsedMs: number, limitMs: number): number {
  const ratio = Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  return Math.round(1000 * (1 - ratio / 2));
}

/**
 * Bulk paste format, one block per question separated by a blank line:
 *
 *   Ibu kota Indonesia?
 *   * Jakarta
 *   Bandung
 *   Surabaya
 *
 * The line marked with `*` is the correct answer. Leading "A." / "a)" / "-" are stripped.
 */
export function parseBulk(text: string): Question[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length >= 3)
    .map((lines) => {
      const [head, ...rest] = lines;
      let correct = 0;
      const options = rest.slice(0, 4).map((line, i) => {
        let l = line;
        if (l.startsWith("*")) {
          correct = i;
          l = l.slice(1).trim();
        }
        return l.replace(/^([a-dA-D][.)]|-)\s+/, "").slice(0, LIMITS.option);
      });
      const text = head.replace(/^\d+[.)]\s*/, "").slice(0, LIMITS.question);
      return { text, options, correct, time: 20 };
    });
}

export const SAMPLE_QUIZ: Quiz = {
  title: "Pengetahuan Umum Nusantara",
  questions: [
    {
      text: "Danau vulkanik terbesar di Indonesia adalah…",
      options: ["Danau Toba", "Danau Maninjau", "Danau Singkarak", "Danau Poso"],
      correct: 0,
      time: 20,
    },
    {
      text: "Hasil dari 12 × 12 adalah",
      options: ["124", "144", "132", "154"],
      correct: 1,
      time: 10,
    },
    {
      text: "Planet yang dijuluki planet merah adalah",
      options: ["Venus", "Jupiter", "Mars", "Merkurius"],
      correct: 2,
      time: 20,
    },
    {
      text: "Komodo adalah hewan endemik dari provinsi…",
      options: ["Bali", "Nusa Tenggara Timur", "Sulawesi Selatan", "Maluku"],
      correct: 1,
      time: 20,
    },
    {
      text: "Air mendidih pada suhu 100 °C di permukaan laut.",
      options: ["Benar", "Salah"],
      correct: 0,
      time: 10,
    },
  ],
};
