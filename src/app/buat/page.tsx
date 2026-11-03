import type { Metadata } from "next";
import { Studio } from "@/components/Studio";
import { Wordmark } from "@/components/Wordmark";

export const metadata: Metadata = { title: "Buat kuis — QuizKin" };

export default function BuatPage() {
  return (
    <main className="page">
      <header className="topbar">
        <Wordmark />
      </header>
      <Studio />
    </main>
  );
}
