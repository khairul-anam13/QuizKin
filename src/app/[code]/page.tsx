import { notFound } from "next/navigation";
import { PlayerScreen } from "@/components/PlayerScreen";

export default async function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  return (
    <div className="page page-game">
      <PlayerScreen code={code} />
    </div>
  );
}
