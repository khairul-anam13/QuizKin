# QuizKin

Kuis kelas berbasis kode ruangan. Guru menyusun soal, membuka ruangan, murid masuk dari HP dengan kode 6 angka. Tanpa akun.

## Menjalankan

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Produksi:

```bash
pnpm build
pnpm start
```

Agar murid di jaringan Wi-Fi yang sama bisa masuk, jalankan dengan `pnpm start -H 0.0.0.0` lalu bagikan alamat IP komputer guru.

## Alur

- `/` — murid mengetik kode, diarahkan ke `/{kode}`.
- `/buat` — guru menyusun kuis (tersimpan di `localStorage`), bisa tempel banyak soal sekaligus, lalu **Mulai sesi**.
- `/host/{kode}` — layar guru: lobby + QR, soal dengan timer, distribusi jawaban, peringkat, podium, unduh nilai CSV.
- `/{kode}` — layar murid: isi nama, jawab, lihat benar/salah, poin dan peringkat.

Skor: jawaban benar bernilai 500–1000 poin, makin cepat makin besar. Soal ditutup otomatis saat waktu habis atau semua peserta online sudah menjawab.

## Arsitektur

- Next.js App Router + TypeScript, tanpa library UI. Satu-satunya dependensi tambahan: `uqr` (kode QR).
- State ruangan disimpan di memori proses Node (`src/lib/server/rooms.ts`); server adalah sumber kebenaran untuk waktu dan skor.
- Realtime memakai Server-Sent Events (`/api/rooms/{kode}/events`); aksi dikirim lewat `POST /api/rooms/{kode}`.
- Guru dikenali lewat `hostKey` acak, murid lewat `pid` + `token`, keduanya disimpan di `localStorage` sehingga refresh halaman tidak memutus sesi.
- Ruangan yang tidak aktif selama 4 jam dihapus otomatis.

**Catatan deploy:** karena state ada di memori, aplikasi harus berjalan sebagai **satu proses Node yang hidup terus** (VPS, Railway, Fly.io, Render, Docker, dsb). Platform serverless seperti Vercel tidak cocok tanpa mengganti penyimpanan ke Redis atau sejenisnya.
