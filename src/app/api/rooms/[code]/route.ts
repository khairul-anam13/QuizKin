import { answer, hostAction, join, publicInfo } from "@/lib/server/rooms";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const info = await publicInfo((await params).code);
  return info
    ? Response.json(info)
    : Response.json({ error: "Kode ruangan tidak ditemukan." }, { status: 404 });
}

export async function POST(req: Request, { params }: Ctx) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const result =
    body.action === "join"
      ? await join(code, body.name)
      : body.action === "answer"
        ? await answer(code, body.pid, body.token, body.qIndex, body.choice)
        : await hostAction(code, body.hostKey, body.action, body);

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  const { ok: _ok, ...data } = result;
  return Response.json(data);
}
