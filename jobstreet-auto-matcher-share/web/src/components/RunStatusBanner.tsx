"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { ScrapeRun } from "@/lib/types";

interface RunStatusBannerProps {
  run: ScrapeRun | null;
}

const MODE_LABELS: Record<ScrapeRun["mode"], string> = {
  reuse_cv: "CV & Research Lama",
  new_cv: "CV Baru",
  new_research: "Research Baru",
  scheduled: "Jadwal Otomatis Harian",
};

const STATUS_LABELS: Record<ScrapeRun["status"], string> = {
  queued: "Menunggu Antrean",
  running: "Sedang Berjalan",
  completed: "Selesai",
  failed: "Gagal",
  blocked_by_site: "Dibatasi Situs",
};

export function RunStatusBanner({ run }: RunStatusBannerProps) {
  if (!run) return null;

  const isRunning = run.status === "queued" || run.status === "running";
  const isSuccess = run.status === "completed";
  const isBlocked = run.status === "blocked_by_site";

  const toneClass = isRunning
    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
    : isSuccess
      ? "border-[var(--status-good-border)] bg-[var(--status-good-bg)] text-[var(--status-good-text)]"
      : isBlocked
        ? "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] text-[var(--status-warn-text)]"
        : "border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] text-[var(--status-bad-text)]";

  return (
    <section
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${toneClass}`}
    >
      <div className="flex items-start gap-3 sm:items-center">
        {isRunning ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin sm:mt-0" aria-hidden="true" />
        ) : isSuccess ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        ) : isBlocked ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden="true" />
        )}
        <div>
          <p className="font-semibold">
            {MODE_LABELS[run.mode]}: {STATUS_LABELS[run.status]}
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            {isRunning
              ? "Worker GitHub Actions sedang bekerja di server. Halaman ini otomatis diperbarui setiap 8 detik."
              : run.error_message
                ? run.error_message
                : `Lowongan discrape: ${run.jobs_scraped} (${run.jobs_new} baru), di-match: ${run.jobs_matched}`}
          </p>
        </div>
      </div>

      <div className="font-mono-num flex items-center gap-1.5 text-xs opacity-85">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <time dateTime={run.finished_at || run.started_at || run.created_at}>
          {new Date(run.finished_at || run.started_at || run.created_at).toLocaleString(
            "id-ID"
          )}
        </time>
      </div>
    </section>
  );
}
