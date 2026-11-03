import { answer, getRoom, hostAction, isHost, join, playerFor, publicInfo } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

const notFound = () => Response.json({ error: "Kode ruangan tidak ditemukan." }, { status: 404 });

export async function GET(_req: Request, { params }: Ctx) {
  const room = getRoom((await params).code);
  return room ? Response.json(publicInfo(room)) : notFound();
}

export async function POST(req: Request, { params }: Ctx) {
  const room = getRoom((await params).code);
  if (!room) return notFound();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  let result;
  if (body.action === "join") {
    result = join(room, body.name);
  } else if (body.action === "answer") {
    const player = playerFor(room, body.pid, body.token);
    if (!player) return Response.json({ error: "Sesi kamu tidak dikenal. Masuk lagi." }, { status: 401 });
    result = answer(room, player, body.qIndex, body.choice);
  } else {
    if (!isHost(room, body.hostKey)) return Response.json({ error: "Hanya pengajar yang bisa melakukan ini." }, { status: 403 });
    result = hostAction(room, body.action, body);
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...data } = result;
  return Response.json(data);
}
