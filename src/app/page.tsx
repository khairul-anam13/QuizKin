import Link from "next/link";
import { CodeEntry } from "@/components/CodeEntry";
import { Wordmark } from "@/components/Wordmark";

export default function Home() {
  return (
    <main className="page landing">
      <header className="topbar">
        <Wordmark />
      </header>

      <section className="join">
        <h1 className="display-l">Masukkan kode dari gurumu</h1>
        <CodeEntry />
      </section>

      <section className="teach">
        <h2 className="display-s">Mengajar hari ini?</h2>
        <p>
          Susun soal pilihan ganda, bagikan kode ke kelas, lalu lihat jawaban masuk saat itu juga. Tidak perlu
          akun, murid cukup buka dari HP.
        </p>
        <Link className="btn btn-ink" href="/buat">
          Buat kuis
        </Link>
      </section>
    </main>
  );
}
