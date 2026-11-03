import { sanitizeQuiz } from "@/lib/quiz";
import { createRoom } from "@/lib/server/rooms";

export async function POST(req: Request) {
  const quiz = sanitizeQuiz(await req.json().catch(() => null));
  if (!quiz) return Response.json({ error: "Kuis belum lengkap." }, { status: 400 });
  return Response.json(createRoom(quiz));
}
