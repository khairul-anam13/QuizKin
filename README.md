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

Suara dan efek: layar guru memutar musik latar (lobby, saat soal, dan podium), bunyi detik di 5 detik terakhir, dan konfeti saat jawaban dibuka dan di podium. HP murid hanya memutar efek pendek (benar, salah, beruntun, medali) supaya kelas tidak riuh oleh 30 musik sekaligus. Semua suara dibuat langsung dengan Web Audio (`src/lib/sound.ts`), jadi tidak ada file audio yang perlu diunduh. Tombol speaker di pojok atas mematikan suara, dan pilihan itu diingat browser.

## Arsitektur

- Next.js App Router + TypeScript, tanpa library UI. Dependensi tambahan: `uqr` (kode QR) dan `@upstash/redis`.
- State ruangan disimpan di Redis (`src/lib/server/rooms.ts`), jadi semua instance serverless melihat permainan yang sama. Server adalah sumber kebenaran untuk waktu dan skor.
  - Nama peserta, jawaban, dan penutupan soal memakai perintah atomik (`HSETNX`, `SET NX`), sehingga jawaban serentak tidak saling menimpa dan skor tidak terhitung dua kali.
  - Setiap perubahan menaikkan `qk:{kode}:ver`.
- Realtime memakai Server-Sent Events (`/api/rooms/{kode}/events`). Stream-stream untuk ruangan yang sama di satu instance berbagi satu pengamat yang mengecek `ver` setiap detik dan memuat ulang state hanya saat berubah. Stream diakhiri sendiri tiap 4 menit (batas durasi function) dan browser langsung menyambung ulang tanpa terlihat.
- Soal ditutup oleh siapa pun yang sedang mengamati begitu waktunya habis, karena serverless tidak punya timer yang bisa diandalkan.
- Guru dikenali lewat `hostKey` acak, murid lewat `pid` + `token`, keduanya disimpan di `localStorage` sehingga refresh halaman tidak memutus sesi.
- Semua key ruangan kedaluwarsa otomatis setelah 12 jam.

Tanpa variabel Redis, aplikasi memakai memori proses. Itu cukup untuk `pnpm dev` atau satu `pnpm start` di laptop guru, tapi tidak untuk serverless.

## Deploy ke Vercel

1. Impor repo ini di Vercel (framework: Next.js, tanpa pengaturan tambahan).
2. Di project Vercel, buka **Storage** (atau Marketplace), pilih **Upstash for Redis**, buat database (paket gratis cukup), lalu hubungkan ke project. Vercel otomatis menambahkan `KV_REST_API_URL` dan `KV_REST_API_TOKEN`.
   Kalau membuat database langsung di upstash.com, isi `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` di Environment Variables.
3. Pilih region database **Singapore (ap-southeast-1)**. Function Vercel sudah diarahkan ke Singapura (`sin1`) lewat `vercel.json`, jadi keduanya dekat dengan murid di Indonesia dan dekat satu sama lain.
4. Deploy ulang setelah variabel ditambahkan.

Netlify juga bisa memakai Redis yang sama, tetapi Netlify menahan stream SSE sampai selesai, sehingga update realtime tidak sampai tepat waktu. Gunakan Vercel atau server Node biasa.
