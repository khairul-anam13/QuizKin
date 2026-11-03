import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Unbounded } from "next/font/google";
import "./globals.css";

const display = Unbounded({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QuizKin — kuis kelas pakai kode",
  description: "Guru membuat kuis, murid masuk dengan kode. Tanpa akun, langsung main dari HP.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F6F7F9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
