import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <section className="notice">
        <h1 className="display-m">Halaman tidak ditemukan</h1>
        <div className="notice-body">
          <p>Kode ruangan selalu 6 angka. Cek lagi tautan atau kode dari pengajarmu.</p>
          <Link className="btn btn-primary" href="/">
            Ke beranda
          </Link>
        </div>
      </section>
    </main>
  );
}
