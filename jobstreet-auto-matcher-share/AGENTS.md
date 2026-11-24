# AGENTS.md — AI Assistant Onboarding Guide

If a user opens this folder and asks for help setting up, deploying, customizing, or troubleshooting **JobStreet Auto-Matcher**, follow these instructions:

## 1. Project Overview (100% Free Tier / Rp 0)
- **`web/`**: Next.js 15 App Router dashboard deployed on **Vercel Hobby** (`Root Directory = web`), protected by Edge Middleware (`web/src/middleware.ts`) using `DASHBOARD_PASSWORD`.
- **`worker/`**: Python 3.11 automated scraper & hybrid CV matcher running on **GitHub Actions** (`.github/workflows/scrape-and-match.yml`, daily cron `0 0 * * *` UTC / 07:00 WIB + `workflow_dispatch` triggered from the Web UI).
- **`supabase/`**: PostgreSQL + private Storage bucket `cvs`. For first-time setup, use the single combined file **`supabase/ALL_IN_ONE_SCHEMA.sql`**.
- **`DESIGN.md`**: UI design specification (editorial precision, Light + Dark mode, Industrial Copper accent, accessible keyboard/mobile targets).

## 2. How to Guide a New User Step by Step
Read `PANDUAN_SETUP_LENGKAP.md` for full details, and guide the user **one step at a time** (confirm each step before moving on):
1. **Supabase (Rp 0)**: Create a free project (region `ap-southeast-1`), run `supabase/ALL_IN_ONE_SCHEMA.sql` once in SQL Editor (or via Supabase MCP if connected), and collect `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
2. **Gemini API Key (Rp 0)**: Free for any standard Gmail account at `https://aistudio.google.com/apikey` (no paid plan required). Optional backup: Groq Free Tier at `https://console.groq.com/keys` (`GROQ_API_KEY`).
3. **GitHub Private Repo + Actions Secrets (Rp 0)**: Create a **Private** repo `jobstreet-auto-matcher`, push this folder (`git init -b main`), add GitHub Actions secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, optional `GROQ_API_KEY` / Telegram), and create a Fine-grained PAT (`GITHUB_TOKEN`) with **Repository permissions → Actions: Read and write**.
4. **Vercel Deploy (Rp 0)**: Import the GitHub repo, set **Root Directory** to `web`, add all 8 required environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_WORKFLOW_FILE=scrape-and-match.yml`, `GITHUB_REF=main`, `DASHBOARD_PASSWORD`), and click **Deploy**.

## 3. Critical Guardrails
- **Never commit secrets or CVs**: `.env`, `web/.env.local`, `*.pdf`, and `*.docx` are gitignored; keep them excluded.
- **Large CV Uploads**: Keep the Supabase Signed Upload URL flow (`/api/cv/upload-url` → `PUT` → `/api/cv`) so PDFs up to 25 MB bypass Vercel's 4.5 MB body limit.
- **Polite Scraping Only**: Never attempt to bypass CAPTCHAs or WAF challenges; `jobstreet_client.py` halts cleanly on 403/429.
- **Verify Before Push**: Run `cd web && npm run build` and check Python syntax before pushing changes to `main`.
