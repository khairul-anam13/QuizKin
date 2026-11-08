import type { Metadata } from "next";
import { RankMeScreen } from "@/components/RankMeScreen";

export const metadata: Metadata = { title: "Mode RankMe — QuizKin" };

export default function RankMePage() {
  return (
    <div className="page">
      <RankMeScreen />
    </div>
  );
}
