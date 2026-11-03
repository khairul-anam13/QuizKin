import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostScreen } from "@/components/HostScreen";

export const metadata: Metadata = { title: "Layar pengajar — QuizKin" };

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound();
  return (
    <div className="page page-host">
      <HostScreen code={code} />
    </div>
  );
}
