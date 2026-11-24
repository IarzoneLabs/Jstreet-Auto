"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, LogOut, Play, RefreshCw, Search } from "lucide-react";
import type { DashboardState } from "@/lib/types";
import { PreScrapeModal } from "@/components/PreScrapeModal";
import { RunStatusBanner } from "@/components/RunStatusBanner";
import { JobMatchList } from "@/components/JobMatchList";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function handleMatchStatusChange(
    matchId: string,
    nextStatus: "new" | "saved" | "applied" | "dismissed"
  ) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            matches: prev.matches.map((m) =>
              m.id === matchId ? { ...m, user_status: nextStatus } : m
            ),
          }
        : prev
    );
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId, user_status: nextStatus }),
    });
    if (!res.ok) {
      loadState();
    }
  }

  const loadState = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data dashboard.");
      setState(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal terhubung ke server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadState();
  }, [loadState]);

  useEffect(() => {
    const status = state?.latestRun?.status;
    if (status === "completed" || status === "failed" || status === "blocked_by_site") {
      setToast(null);
      return;
    }
    if (status !== "queued" && status !== "running") return;
    const timer = setInterval(loadState, 8000);
    return () => clearInterval(timer);
  }, [state?.latestRun?.status, loadState]);

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              JobStreet Auto-Matcher
            </h1>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Ranking lowongan otomatis berbasis CV aktif dan konfigurasi research Anda
            </p>
          </div>

          <nav
            aria-label="Aksi utama dashboard"
            className="flex flex-wrap items-center gap-2"
          >
            <ThemeToggle />
            <button
              type="button"
              onClick={loadState}
              aria-label="Segarkan data dashboard"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              <span>Pembaruan &amp; Scrape</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--status-bad-border)] hover:text-[var(--status-bad-text)]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Keluar</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {toast && (
          <div
            role="status"
            className="rounded-md border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-4 py-3 text-sm font-medium text-[var(--status-good-text)]"
          >
            {toast}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-4 py-3 text-sm text-[var(--status-bad-text)]"
          >
            <span>
              <strong>Koneksi Gagal:</strong> {error}
            </span>
            <button
              type="button"
              onClick={loadState}
              className="min-h-[36px] rounded-sm border border-current px-3 text-xs font-semibold hover:opacity-80"
            >
              Coba Lagi
            </button>
          </div>
        )}

        {/* Asymmetric Workspace Context Strip (7:5 split, R-14) */}
        <section
          aria-label="Ringkasan konfigurasi aktif"
          className="grid grid-cols-1 gap-4 lg:grid-cols-12"
        >
          {/* Left Wide Context Panel: CV Aktif + Research Aktif */}
          <div className="grid grid-cols-1 divide-y divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:col-span-8">
            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                <FileText className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span>CV Aktif</span>
              </div>
              <p className="mt-2 truncate text-sm font-bold text-[var(--text-primary)]">
                {state?.activeCv?.filename || "Belum ada CV diunggah"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {state?.activeCv
                  ? `${state.activeCv.extracted_skills.length} skill terdeteksi · ${state.cvList.length} versi CV`
                  : "Klik Pembaruan & Scrape untuk mengunggah PDF atau DOCX."}
              </p>
            </div>

            <div className="p-4 sm:p-5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                <Search className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
                <span>Research Aktif</span>
              </div>
              <p className="mt-2 truncate text-sm font-bold text-[var(--text-primary)]">
                {state?.activeConfig?.keywords?.join(", ") || "Belum diset"}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Lokasi: {state?.activeConfig?.location || "-"} · Max{" "}
                <span className="font-mono-num">
                  {state?.activeConfig?.max_pages || 3}
                </span>{" "}
                halaman
              </p>
            </div>
          </div>

          {/* Right Narrow Telemetry Panel: Tabular Numeric Counts */}
          <div className="grid grid-cols-2 divide-x divide-[var(--border-subtle)] rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-subtle)] lg:col-span-4">
            <div className="p-4 sm:p-5">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Ter-ranking
              </p>
              <p className="font-mono-num mt-1.5 text-2xl font-bold text-[var(--text-primary)]">
                {state?.matches.length ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                Lowongan CV ini
              </p>
            </div>
            <div className="p-4 sm:p-5">
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Database
              </p>
              <p className="font-mono-num mt-1.5 text-2xl font-bold text-[var(--text-primary)]">
                {state?.totalJobsInDb ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                Lowongan unik
              </p>
            </div>
          </div>
        </section>

        {/* Live Run Status */}
        <RunStatusBanner run={state?.latestRun ?? null} />

        {/* Ranked Job Matches */}
        <section aria-label="Daftar lowongan ter-ranking">
          {loading ? (
            <div
              role="status"
              className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6"
            >
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                Memuat data lowongan dan skor kecocokan...
              </p>
              <div className="space-y-2.5" aria-hidden="true">
                <div className="h-20 rounded-md bg-[var(--bg-subtle)]" />
                <div className="h-20 rounded-md bg-[var(--bg-subtle)]" />
                <div className="h-20 rounded-md bg-[var(--bg-subtle)]" />
              </div>
            </div>
          ) : (
            <JobMatchList
              matches={state?.matches ?? []}
              onOpenWizard={() => setModalOpen(true)}
              onStatusChange={handleMatchStatusChange}
            />
          )}
        </section>

        {/* Pre-Scrape Update Wizard */}
        <PreScrapeModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          activeCv={state?.activeCv ?? null}
          cvList={state?.cvList ?? []}
          activeConfig={state?.activeConfig ?? null}
          onCompleted={(msg) => {
            setToast(msg);
            loadState();
          }}
        />
      </main>
    </div>
  );
}
