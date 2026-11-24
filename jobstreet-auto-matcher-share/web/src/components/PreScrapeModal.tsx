"use client";

import { useEffect, useState } from "react";
import { FileText, RefreshCw, Search, Upload, X } from "lucide-react";
import type { CvProfile, SearchConfig } from "@/lib/types";

interface PreScrapeModalProps {
  open: boolean;
  onClose: () => void;
  activeCv: CvProfile | null;
  cvList: CvProfile[];
  activeConfig: SearchConfig | null;
  onCompleted: (message: string) => void;
}

type WizardMode = "reuse_cv" | "new_cv" | "new_research";

export function PreScrapeModal({
  open,
  onClose,
  activeCv,
  cvList,
  activeConfig,
  onCompleted,
}: PreScrapeModalProps) {
  const [mode, setMode] = useState<WizardMode>(activeCv ? "reuse_cv" : "new_cv");
  const [selectedOldCvId, setSelectedOldCvId] = useState<string>(activeCv?.id ?? "");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [skipScrapeOnNewCv, setSkipScrapeOnNewCv] = useState(false);

  const [keywordsText, setKeywordsText] = useState(
    activeConfig?.keywords?.join(", ") || "Continuous Improvement"
  );
  const [excludeKeywordsText, setExcludeKeywordsText] = useState(
    activeConfig?.exclude_keywords?.join(", ") || ""
  );
  const [location, setLocation] = useState(activeConfig?.location || "Jawa Timur");
  const [maxPages, setMaxPages] = useState(activeConfig?.max_pages || 3);
  const [sortBy, setSortBy] = useState<"date" | "relevance">(
    activeConfig?.sort_by || "date"
  );
  const [skipScrapeOnReuse, setSkipScrapeOnReuse] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // R-32: Tutup modal dengan tombol Escape
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting, onClose]);

  // Sinkronkan state ketika modal dibuka
  useEffect(() => {
    if (!open) return;
    setSelectedOldCvId(activeCv?.id ?? "");
    if (activeConfig) {
      setKeywordsText(activeConfig.keywords?.join(", ") || "Continuous Improvement");
      setExcludeKeywordsText(activeConfig.exclude_keywords?.join(", ") || "");
      setLocation(activeConfig.location || "Jawa Timur");
      setMaxPages(activeConfig.max_pages || 3);
      setSortBy(activeConfig.sort_by || "date");
    }
    setSuggestNote(null);
    setError(null);
  }, [open, activeCv, activeConfig]);

  async function handleSuggestFromCv() {
    setSuggesting(true);
    setError(null);
    setSuggestNote(null);
    try {
      const res = await fetch("/api/research/suggest", { method: "POST" });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data.error || "Gagal mengambil rekomendasi keyword dari CV.");
      }
      if (Array.isArray(data.keywords) && data.keywords.length > 0) {
        setKeywordsText(data.keywords.join(", "));
      }
      if (Array.isArray(data.exclude_keywords)) {
        setExcludeKeywordsText(data.exclude_keywords.join(", "));
      }
      if (typeof data.location === "string" && data.location.trim()) {
        setLocation(data.location.trim());
      }
      setSuggestNote(
        `Rekomendasi diisi otomatis dari ${data.cvFilename || "CV aktif"}. Anda bisa mengedit sebelum menjalankan.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menganalisis CV.");
    } finally {
      setSuggesting(false);
    }
  }

  if (!open) return null;

  async function parseJsonSafe(res: Response) {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      if (res.status === 413 || text.toLowerCase().includes("request entity too large")) {
        return { error: "Ukuran file terlalu besar untuk upload langsung. Silakan coba lagi." };
      }
      return { error: text.slice(0, 200) || `Server error (HTTP ${res.status})` };
    }
  }

  async function uploadCvFile(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      throw new Error("Ukuran file CV maksimal 25 MB.");
    }

    const urlRes = await fetch("/api/cv/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      }),
    });
    const urlData = await parseJsonSafe(urlRes);
    if (!urlRes.ok) {
      throw new Error(urlData.error || "Gagal menyiapkan upload CV.");
    }

    const putRes = await fetch(urlData.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error(`Gagal mengunggah file CV ke storage (HTTP ${putRes.status}).`);
    }

    const finRes = await fetch("/api/cv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        storagePath: urlData.storagePath,
      }),
    });
    const finData = await parseJsonSafe(finRes);
    if (!finRes.ok) throw new Error(finData.error || "Gagal memproses CV baru.");
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "reuse_cv" && selectedOldCvId && selectedOldCvId !== activeCv?.id) {
        const res = await fetch("/api/cv", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cvId: selectedOldCvId }),
        });
        if (!res.ok) {
          const data = await parseJsonSafe(res);
          throw new Error(data.error || "Gagal mengganti CV aktif.");
        }
      }

      if (mode === "new_cv" || (mode === "new_research" && cvFile)) {
        if (!cvFile) {
          throw new Error("Silakan pilih file CV (PDF, DOCX, atau TXT) terlebih dahulu.");
        }
        await uploadCvFile(cvFile);
      }

      if (mode === "new_research") {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keywords: keywordsText,
            exclude_keywords: excludeKeywordsText,
            location,
            max_pages: maxPages,
            sort_by: sortBy,
          }),
        });
        const data = await parseJsonSafe(res);
        if (!res.ok) throw new Error(data.error || "Gagal menyimpan research baru.");
      }

      const scrapeRes = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          skip_scrape:
            mode === "new_cv"
              ? skipScrapeOnNewCv
              : mode === "reuse_cv"
                ? skipScrapeOnReuse
                : false,
        }),
      });
      const scrapeData = await parseJsonSafe(scrapeRes);
      if (!scrapeRes.ok) {
        throw new Error(scrapeData.error || "Gagal memicu worker scrape & analisa.");
      }

      onCompleted(scrapeData.message || "Proses scrape & analisa dimulai.");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: {
    id: WizardMode;
    title: string;
    desc: string;
    icon: typeof RefreshCw;
  }[] = [
    {
      id: "reuse_cv",
      title: "CV & Research Lama",
      desc: "Pakai setting terakhir, ambil lowongan terbaru",
      icon: RefreshCw,
    },
    {
      id: "new_cv",
      title: "Upload CV Baru",
      desc: "Ganti CV aktif (PDF/DOCX) lalu match ulang",
      icon: Upload,
    },
    {
      id: "new_research",
      title: "Research Baru",
      desc: "Ubah keyword, lokasi, dan batas halaman",
      icon: Search,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prescrape-modal-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] shadow-xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] px-6 py-4">
          <div>
            <h2
              id="prescrape-modal-title"
              className="text-base font-bold text-[var(--text-primary)]"
            >
              Pembaruan Sebelum Scrape &amp; Analisa
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              Pilih pembaruan CV atau kata kunci pencarian sebelum server mulai bekerja. Tekan Esc untuk menutup.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Tutup dialog"
            className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto px-6 py-5">
          {/* Mode Tabs */}
          <div
            role="tablist"
            aria-label="Mode pembaruan scrape"
            className="grid grid-cols-1 gap-2.5 sm:grid-cols-3"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const selected = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setMode(tab.id);
                    setError(null);
                  }}
                  className={`flex min-h-[44px] flex-col items-start gap-1 rounded-md border p-3.5 text-left transition-colors ${
                    selected
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${selected ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {tab.title}
                  </span>
                  <span className="text-xs leading-snug text-[var(--text-secondary)]">
                    {tab.desc}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Panel */}
          <div className="mt-5 space-y-4">
            {mode === "reuse_cv" && (
              <div className="space-y-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div>
                  <label
                    htmlFor="select-saved-cv"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                  >
                    CV Tersimpan
                  </label>
                  {cvList.length > 0 ? (
                    <select
                      id="select-saved-cv"
                      value={selectedOldCvId || activeCv?.id || ""}
                      onChange={(e) => setSelectedOldCvId(e.target.value)}
                      className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {cvList.map((cv) => (
                        <option key={cv.id} value={cv.id}>
                          {cv.filename} ({cv.extracted_skills.length} skill terdeteksi)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-[var(--status-warn-text)]">
                      Belum ada CV tersimpan. Pilih tab Upload CV Baru untuk mengunggah CV pertama Anda.
                    </p>
                  )}
                </div>

                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]">
                  <p className="font-semibold text-[var(--text-primary)]">
                    Research Aktif Saat Ini
                  </p>
                  <p className="mt-1">
                    Keyword:{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {activeConfig?.keywords?.join(", ") || "-"}
                    </span>
                  </p>
                  <p className="mt-0.5">
                    Lokasi:{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {activeConfig?.location || "-"}
                    </span>{" "}
                    · Max halaman:{" "}
                    <span className="font-mono-num font-medium text-[var(--text-primary)]">
                      {activeConfig?.max_pages || 3}
                    </span>
                  </p>
                  {activeConfig?.exclude_keywords && activeConfig.exclude_keywords.length > 0 && (
                    <p className="mt-0.5">
                      Dikecualikan:{" "}
                      <span className="font-medium text-[var(--status-warn-text)]">
                        {activeConfig.exclude_keywords.join(", ")}
                      </span>
                    </p>
                  )}
                </div>

                <label
                  htmlFor="skip-scrape-reuse-checkbox"
                  className="flex min-h-[44px] items-start gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]"
                >
                  <input
                    id="skip-scrape-reuse-checkbox"
                    type="checkbox"
                    checked={skipScrapeOnReuse}
                    onChange={(e) => setSkipScrapeOnReuse(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-sm accent-[var(--accent)]"
                  />
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      Re-match lowongan database saja tanpa scrape ulang (cepat)
                    </strong>
                    <br />
                    Cocok untuk menilai ulang lowongan tersimpan dengan mesin pencocokan terbaru.
                  </span>
                </label>
              </div>
            )}

            {mode === "new_cv" && (
              <div className="space-y-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <label
                  htmlFor="new-cv-file-input"
                  className="block text-xs font-semibold text-[var(--text-primary)]"
                >
                  File CV Baru (PDF, DOCX, atau TXT)
                </label>
                <label
                  htmlFor="new-cv-file-input"
                  className="flex min-h-[120px] flex-col items-center justify-center rounded-md border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-6 text-center transition-colors hover:border-[var(--accent)]"
                >
                  <FileText
                    className="mb-2 h-7 w-7 text-[var(--accent)]"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {cvFile ? cvFile.name : "Pilih file CV dari perangkat Anda"}
                  </span>
                  <span className="mt-1 text-xs text-[var(--text-secondary)]">
                    Maksimal 25 MB, teks otomatis diekstrak untuk pencocokan
                  </span>
                  <input
                    id="new-cv-file-input"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="sr-only"
                    onChange={(e) => {
                      setCvFile(e.target.files?.[0] ?? null);
                      setError(null);
                    }}
                  />
                </label>

                <label
                  htmlFor="skip-scrape-checkbox"
                  className="flex min-h-[44px] items-start gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-secondary)]"
                >
                  <input
                    id="skip-scrape-checkbox"
                    type="checkbox"
                    checked={skipScrapeOnNewCv}
                    onChange={(e) => setSkipScrapeOnNewCv(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-sm accent-[var(--accent)]"
                  />
                  <span>
                    <strong className="text-[var(--text-primary)]">
                      Re-match ke lowongan yang sudah ada di database saja (lebih cepat)
                    </strong>
                    <br />
                    Jika tidak dicentang, server akan sekaligus men-scrape lowongan terbaru dari JobStreet.
                  </span>
                </label>
              </div>
            )}

            {mode === "new_research" && (
              <div className="space-y-3 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
                  <p className="text-xs text-[var(--text-secondary)]">
                    Isi manual atau ambil rekomendasi otomatis dari CV aktif Anda.
                  </p>
                  <button
                    type="button"
                    onClick={handleSuggestFromCv}
                    disabled={suggesting || !activeCv}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent)] hover:text-white disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{suggesting ? "Menganalisis CV..." : "Auto-Isi dari CV Aktif"}</span>
                  </button>
                </div>

                {suggestNote && (
                  <p
                    role="status"
                    className="rounded-md border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-3 py-2 text-xs font-medium text-[var(--status-good-text)]"
                  >
                    {suggestNote}
                  </p>
                )}

                <div>
                  <label
                    htmlFor="research-keywords"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Kata Kunci Posisi (pisahkan dengan koma)
                  </label>
                  <input
                    id="research-keywords"
                    type="text"
                    value={keywordsText}
                    onChange={(e) => setKeywordsText(e.target.value)}
                    placeholder="Plant Maintenance, Preventive Maintenance, Continuous Improvement"
                    className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="research-exclude-keywords"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Kata Kunci Pengecualian / Negative Keywords (opsional, pisahkan koma)
                  </label>
                  <input
                    id="research-exclude-keywords"
                    type="text"
                    value={excludeKeywordsText}
                    onChange={(e) => setExcludeKeywordsText(e.target.value)}
                    placeholder="Tax, Accounting, Finance, Sales, Marketing"
                    className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label
                      htmlFor="research-location"
                      className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Lokasi
                    </label>
                    <input
                      id="research-location"
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Jawa Timur"
                      className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="research-max-pages"
                      className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Max Halaman / Keyword
                    </label>
                    <input
                      id="research-max-pages"
                      type="number"
                      min={1}
                      max={10}
                      value={maxPages}
                      onChange={(e) => setMaxPages(Number(e.target.value) || 3)}
                      className="font-mono-num min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="research-sort"
                      className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                    >
                      Urutkan
                    </label>
                    <select
                      id="research-sort"
                      value={sortBy}
                      onChange={(e) =>
                        setSortBy(e.target.value === "relevance" ? "relevance" : "date")
                      }
                      className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      <option value="date">Terbaru (Date)</option>
                      <option value="relevance">Paling Relevan</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="research-optional-cv"
                    className="mb-1.5 block text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Opsional: Sekalian Unggah CV Baru (kosongkan untuk pakai CV lama)
                  </label>
                  <input
                    id="research-optional-cv"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => {
                      setCvFile(e.target.files?.[0] ?? null);
                      setError(null);
                    }}
                    className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-sm file:border-0 file:bg-[var(--bg-subtle)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--text-primary)]"
                  />
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-md border border-[var(--status-bad-border)] bg-[var(--status-bad-bg)] px-4 py-2.5 text-xs font-medium text-[var(--status-bad-text)]"
              >
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                Memproses...
              </>
            ) : (
              "Konfirmasi & Jalankan di Server"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
