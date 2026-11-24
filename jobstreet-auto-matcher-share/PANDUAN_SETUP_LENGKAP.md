# Panduan Setup Lengkap dari Nol (100% Gratis / Rp 0)

Panduan ini dirancang agar siapa pun (bahkan yang baru pertama kali memakai Supabase, GitHub Actions, atau Vercel) bisa menjalankan **JobStreet Auto-Matcher** pribadi mereka sendiri dalam **10–15 menit** dengan biaya **Rp 0**.

> **Penting:** Setiap pengguna wajib membuat akun & API key sendiri (semuanya gratis, cukup akun Gmail & GitHub biasa). Jangan pernah membagikan file `.env` atau API key pribadi Anda ke orang lain.

---

## Peta Lengkap Semua API Key & Variabel (Dapat dari Mana & Taruh di Mana)

Gunakan tabel ini sebagai contekan utama selama proses setup:

| Nama Variabel | Wajib? | Dapat dari Mana? | Taruh di **GitHub Secrets**? | Taruh di **Vercel Env Vars**? |
| :--- | :---: | :--- | :---: | :---: |
| `SUPABASE_URL` | **Wajib** | Supabase → *Project Settings → API → Project URL* | ✅ Ya | ✅ Ya |
| `SUPABASE_SERVICE_ROLE_KEY` | **Wajib** | Supabase → *Project Settings → API → Secret / `service_role` key* | ✅ Ya | ✅ Ya |
| `GEMINI_API_KEY` | **Wajib (AI)** | Google AI Studio: https://aistudio.google.com/apikey *(Gratis, cukup Gmail biasa, tidak perlu Google Pro)* | ✅ Ya | ❌ Tidak |
| `GROQ_API_KEY` | Opsional *(Cadangan AI)* | Groq Console: https://console.groq.com/keys *(Gratis, otomatis aktif jika Gemini sedang penuh)* | ✅ Ya | ❌ Tidak |
| `GITHUB_TOKEN` | **Wajib** | GitHub → *Settings → Developer settings → Fine-grained tokens* (izin **Actions: Read and write**) | ❌ Tidak | ✅ Ya |
| `GITHUB_OWNER` | **Wajib** | Username GitHub Anda (misal `budi123`) | ❌ Tidak | ✅ Ya |
| `GITHUB_REPO` | **Wajib** | Nama repository GitHub Anda (misal `jobstreet-auto-matcher`) | ❌ Tidak | ✅ Ya |
| `GITHUB_WORKFLOW_FILE` | **Wajib** | Isi persis: `scrape-and-match.yml` | ❌ Tidak | ✅ Ya |
| `GITHUB_REF` | **Wajib** | Isi persis: `main` | ❌ Tidak | ✅ Ya |
| `DASHBOARD_PASSWORD` | **Wajib** | Bebas buat PIN/password sendiri (misal `202699`) untuk mengunci web Anda | ❌ Tidak | ✅ Ya |
| `TELEGRAM_BOT_TOKEN` | Opsional | Chat ke `@BotFather` di Telegram → `/newbot` | ✅ Ya | ❌ Tidak |
| `TELEGRAM_CHAT_ID` | Opsional | Chat ke `@userinfobot` di Telegram → salin angka `Id` | ✅ Ya | ❌ Tidak |

---

## Langkah 1: Setup Database & Storage di Supabase (Gratis, ~3 Menit)

1. Daftar / login ke https://supabase.com (bisa pakai akun GitHub).
2. Klik **New Project**:
   - **Name**: `jobstreet-auto-matcher`
   - **Database Password**: buat password bebas (simpan baik-baik)
   - **Region**: pilih **Southeast Asia (Singapore)** (`ap-southeast-1`) agar paling cepat dari Indonesia.
   - Tunggu ~1–2 menit sampai status project menjadi **Active**.
3. Di menu kiri, buka **SQL Editor** → klik **New query**.
4. Buka file **`supabase/ALL_IN_ONE_SCHEMA.sql`** dari folder ini, salin **SELURUH** isinya, tempel ke SQL Editor, lalu klik **Run**.
   - Jika sukses, akan terbentuk 5 tabel (`cv_profiles`, `search_configs`, `scrape_runs`, `jobs`, `job_matches`) dan 1 bucket privat (`cvs`).
5. Ambil 2 kunci Supabase Anda di menu kiri **Project Settings (ikon gerigi) → API**:
   - Salin **Project URL** → simpan sebagai `SUPABASE_URL`.
   - Salin **Secret key (`sb_secret_...`)** atau **`service_role` key** → simpan sebagai `SUPABASE_SERVICE_ROLE_KEY`.

---

## Langkah 2: Ambil Gemini API Key Gratis (Tanpa Google Pro, ~1 Menit)

1. Buka https://aistudio.google.com/apikey dan login dengan **akun Gmail biasa**.
2. Jika baru pertama kali, centang persetujuan *Terms of Service* lalu klik **Continue**.
3. Klik **Create API key** → salin kodenya → simpan sebagai `GEMINI_API_KEY`.

*(Opsional tapi sangat disarankan)*: Buat juga API Key cadangan gratis di https://console.groq.com/keys → klik **Create API Key** → simpan sebagai `GROQ_API_KEY`. Jika suatu saat server Gemini Free Tier sedang sibuk (`503`), worker akan otomatis pindah ke Groq (`llama-3.3-70b-versatile`) tanpa jeda.

---

## Langkah 3: Upload ke GitHub & Pasang Secrets (~4 Menit)

> **Tips Privasi:** Anda sangat disarankan membuat repository **Private**! GitHub Free tetap memberi **2.000 menit/bulan gratis** untuk GitHub Actions di repo Private (pemakaian harian kita hanya ~100 menit/bulan).

1. Buka https://github.com/new dan buat repository baru bernama **`jobstreet-auto-matcher`** (pilih **Private**, **jangan** centang README atau `.gitignore`).
2. Upload isi folder project ini ke repository tersebut lewat terminal:
   ```bash
   cd jobstreet-auto-matcher-share
   git init -b main
   git add .
   git commit -m "Initial commit: JobStreet Auto-Matcher"
   git remote add origin https://github.com/USERNAME_ANDA/jobstreet-auto-matcher.git
   git push -u origin main
   ```
3. Pasang **GitHub Actions Secrets**:
   - Di halaman repository GitHub Anda, klik **Settings → Secrets and variables → Actions → New repository secret**.
   - Tambahkan satu per satu:
     - `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `GEMINI_API_KEY`
     - *(Opsional)* `GROQ_API_KEY`
     - *(Opsional)* `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID`
4. Buat **Token Trigger (`GITHUB_TOKEN`)** agar tombol di Web bisa menjalankan GitHub Actions:
   - Buka https://github.com/settings/personal-access-tokens/new
   - **Token name**: `jobstreet-auto-matcher-trigger`
   - **Expiration**: 90 days (atau sesuai kebutuhan)
   - **Repository access**: pilih **Only select repositories** → pilih `jobstreet-auto-matcher`
   - Buka bagian **Permissions → Repository permissions**:
     - Cari **Actions** → ubah menjadi **Read and write**
   - Klik **Generate token** → salin token (`github_pat_...`) → simpan sebagai `GITHUB_TOKEN`.

---

## Langkah 4: Deploy Web Dashboard ke Vercel (Gratis, ~3 Menit)

1. Daftar / login ke https://vercel.com menggunakan akun GitHub Anda (pilih paket **Hobby / Free**).
2. Klik **Add New → Project** → pilih repository **`jobstreet-auto-matcher`** → klik **Import**.
3. **PENTING — Root Directory**:
   - Pada baris **Root Directory**, klik **Edit** lalu pilih folder **`web`** → klik **Continue**.
4. Buka bagian **Environment Variables**, lalu tambahkan **8 variabel** berikut:
   - `SUPABASE_URL` = *(URL Supabase dari Langkah 1)*
   - `SUPABASE_SERVICE_ROLE_KEY` = *(Secret key Supabase dari Langkah 1)*
   - `GITHUB_TOKEN` = *(Token `github_pat_...` dari Langkah 3.4)*
   - `GITHUB_OWNER` = *(Username GitHub Anda)*
   - `GITHUB_REPO` = `jobstreet-auto-matcher`
   - `GITHUB_WORKFLOW_FILE` = `scrape-and-match.yml`
   - `GITHUB_REF` = `main`
   - `DASHBOARD_PASSWORD` = *(PIN rahasia pilihan Anda sendiri untuk login ke web)*
5. Klik **Deploy** dan tunggu ~1 menit sampai muncul URL web Anda (contoh: `https://jobstreet-auto-matcher-xxx.vercel.app`).

---

## Langkah 5: Cara Pemakaian Harian (Workflow)

1. **Login ke Web Anda**:
   - Buka URL Vercel Anda → masukkan PIN `DASHBOARD_PASSWORD` yang Anda buat di Langkah 4.
   - Anda bisa mengganti tema **Light / Dark Mode** lewat ikon matahari/bulan di pojok kanan atas.
2. **Upload CV Pertama Kali**:
   - Klik tombol **Pembaruan & Scrape** → pilih tab **Upload CV Baru**.
   - Unggah file CV Anda (**PDF berbasis teks, DOCX, atau TXT**, maksimal **25 MB**).
   - Klik **Konfirmasi & Jalankan di Server**.
3. **Atur Kata Kunci Otomatis dari CV**:
   - Klik **Pembaruan & Scrape** → pilih tab **Research Baru**.
   - Klik tombol **"Auto-Isi dari CV Aktif"** — sistem akan otomatis mengisi usulan **Kata Kunci Posisi**, **Negative Keywords** (pengecualian profesi melenceng), dan **Lokasi** sesuai CV Anda.
   - Edit jika perlu, atur *Max Halaman / Keyword* (rekomendasi: `3–5` halaman agar cepat ~2–3 menit), lalu klik **Konfirmasi & Jalankan di Server**.
4. **Pantau & Evaluasi Lowongan**:
   - Anda boleh menutup tab browser — server GitHub Actions tetap bekerja di cloud dan menyimpan hasilnya ke Supabase.
   - Setelah selesai, lowongan otomatis diurutkan dari **Skor Kecocokan Tertinggi**.
   - Klik **Lihat Deskripsi Lengkap** untuk membaca *Responsibilities & Requirements* langsung di dashboard.
   - Gunakan filter lokasi, keyword, pengecualian cepat, dan tombol **Simpan / Tandai Dilamar / Abaikan** (Job Tracker) untuk mengelola lamaran Anda.
5. **Otomasi Harian**:
   - Setiap hari pukul **07:00 WIB**, server otomatis mencari lowongan terbaru sesuai CV aktif & konfigurasi research terakhir Anda.

---

## Pertanyaan Umum & Troubleshooting

- **Kenapa muncul error *"Teks CV tidak berhasil diekstrak"* saat upload PDF?**
  - PDF Anda kemungkinan berupa hasil *scan gambar*. Export ulang CV dari Word / Google Docs / Canva sebagai **PDF Standard (berbasis teks)** atau unggah langsung file **`.docx`**.
- **Bagaimana cara mengubah jam jadwal otomatis harian?**
  - Edit file `.github/workflows/scrape-and-match.yml` pada baris `cron: '0 0 * * *'` (waktu dalam UTC; `0 0 * * *` = 07:00 WIB, `0 23 * * *` = 06:00 WIB).
- **Lupa PIN Dashboard?**
  - Buka Vercel → Project Anda → *Settings → Environment Variables* → ubah nilai `DASHBOARD_PASSWORD`, lalu klik **Redeploy**.
- **Apakah bisa dijalankan secara lokal di laptop?**
  - Ya. Salin `.env.example` menjadi `.env` (untuk worker Python) dan `web/.env.local` (untuk Next.js), isi variabelnya, lalu jalankan:
    - Worker: `cd worker && pip install -r requirements.txt && python run_pipeline.py --mode reuse_cv`
    - Web: `cd web && npm install && npm run dev`
