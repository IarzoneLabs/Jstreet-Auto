"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  EyeOff,
  FileText,
  Lightbulb,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Wallet,
} from "lucide-react";
import type { JobMatchItem } from "@/lib/types";

type TrackerTab = "active" | "saved" | "applied" | "dismissed";
type SortOption = "score" | "newest" | "salary";
type MatchStatus = "new" | "saved" | "applied" | "dismissed";

interface JobMatchListProps {
  matches: JobMatchItem[];
  onOpenWizard?: () => void;
  onStatusChange?: (matchId: string, nextStatus: MatchStatus) => Promise<void>;
}

const PAGE_SIZE = 25;

export function JobMatchList({
  matches,
  onOpenWizard,
  onStatusChange,
}: JobMatchListProps) {
  const [trackerTab, setTrackerTab] = useState<TrackerTab>("active");
  const [query, setQuery] = useState("");
  const [excludeText, setExcludeText] = useState("");
  const [minScore, setMinScore] = useState<number>(0);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [onlyWithSalary, setOnlyWithSalary] = useState(false);
  const [onlyAiScored, setOnlyAiScored] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});
  const [descCache, setDescCache] = useState<Record<string, string>>({});
  const [loadingDescId, setLoadingDescId] = useState<string | null>(null);

  const uniqueLocations = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      const loc = m.jobs?.job_location?.trim();
      if (loc) set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  const uniqueKeywords = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) {
      const kw = m.jobs?.search_keyword?.trim();
      if (kw) set.add(kw);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [matches]);

  const hasAnyAi = useMemo(
    () => matches.some((m) => m.scored_by === "gemini" || m.scored_by === "groq"),
    [matches]
  );

  const tabCounts = useMemo(() => {
    let active = 0;
    let saved = 0;
    let applied = 0;
    let dismissed = 0;
    for (const m of matches) {
      const st = m.user_status || "new";
      if (st === "dismissed") {
        dismissed++;
      } else {
        active++;
        if (st === "saved") saved++;
        if (st === "applied") applied++;
      }
    }
    return { active, saved, applied, dismissed };
  }, [matches]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const excludeTerms = excludeText
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const list = matches.filter((m) => {
      const st = m.user_status || "new";
      if (trackerTab === "active" && st === "dismissed") return false;
      if (trackerTab === "saved" && st !== "saved") return false;
      if (trackerTab === "applied" && st !== "applied") return false;
      if (trackerTab === "dismissed" && st !== "dismissed") return false;

      if (m.match_score < minScore) return false;
      if (onlyWithSalary && !m.jobs?.job_salary_range) return false;
      if (onlyAiScored && m.scored_by !== "gemini" && m.scored_by !== "groq") return false;
      if (locationFilter !== "all" && (m.jobs?.job_location || "") !== locationFilter) {
        return false;
      }
      if (keywordFilter !== "all" && (m.jobs?.search_keyword || "") !== keywordFilter) {
        return false;
      }

      if (excludeTerms.length > 0) {
        const titleLower = (m.jobs?.job_title || "").toLowerCase();
        if (excludeTerms.some((term) => titleLower.includes(term))) {
          return false;
        }
      }

      if (!q) return true;
      const haystack = [
        m.jobs?.job_title,
        m.jobs?.company_name,
        m.jobs?.job_location,
        m.jobs?.search_keyword,
        m.summary_reason,
        ...(m.matched_skills || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    if (sortBy === "newest") {
      list.sort((a, b) => {
        const da = a.jobs?.job_posted_date || a.jobs?.scraped_at || "";
        const db = b.jobs?.job_posted_date || b.jobs?.scraped_at || "";
        return db.localeCompare(da) || b.match_score - a.match_score;
      });
    } else if (sortBy === "salary") {
      list.sort((a, b) => {
        const sa = a.jobs?.job_salary_range ? 1 : 0;
        const sb = b.jobs?.job_salary_range ? 1 : 0;
        return sb - sa || b.match_score - a.match_score;
      });
    } else {
      list.sort((a, b) => b.match_score - a.match_score);
    }

    return list;
  }, [
    matches,
    trackerTab,
    query,
    excludeText,
    minScore,
    locationFilter,
    keywordFilter,
    sortBy,
    onlyWithSalary,
    onlyAiScored,
  ]);

  const hasActiveFilters =
    query.trim() !== "" ||
    excludeText.trim() !== "" ||
    minScore > 0 ||
    locationFilter !== "all" ||
    keywordFilter !== "all" ||
    onlyWithSalary ||
    onlyAiScored ||
    sortBy !== "score";

  function resetFilters() {
    setQuery("");
    setExcludeText("");
    setMinScore(0);
    setLocationFilter("all");
    setKeywordFilter("all");
    setSortBy("score");
    setOnlyWithSalary(false);
    setOnlyAiScored(false);
    setVisibleCount(PAGE_SIZE);
  }

  async function handleStatusClick(matchId: string, nextStatus: MatchStatus) {
    if (!onStatusChange) return;
    setUpdatingId(matchId);
    try {
      await onStatusChange(matchId, nextStatus);
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleDescription(jobId: string) {
    const isOpen = Boolean(expandedJobIds[jobId]);
    if (isOpen) {
      setExpandedJobIds((prev) => ({ ...prev, [jobId]: false }));
      return;
    }

    setExpandedJobIds((prev) => ({ ...prev, [jobId]: true }));
    if (descCache[jobId] !== undefined) return;

    setLoadingDescId(jobId);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "force-cache" });
      const data = await res.json();
      setDescCache((prev) => ({
        ...prev,
        [jobId]: res.ok ? data.job_requirements || "" : "",
      }));
    } catch {
      setDescCache((prev) => ({ ...prev, [jobId]: "" }));
    } finally {
      setLoadingDescId((curr) => (curr === jobId ? null : curr));
    }
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-12 text-center">
        <Briefcase
          className="mx-auto mb-3 h-8 w-8 text-[var(--text-secondary)]"
          aria-hidden="true"
        />
        <h2 className="text-base font-semibold text-[var(--text-primary)]">
          Belum ada hasil pencocokan lowongan
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
          Unggah CV Anda dan jalankan scraping JobStreet untuk melihat daftar lowongan yang diurutkan dari skor kecocokan tertinggi.
        </p>
        {onOpenWizard && (
          <button
            type="button"
            onClick={onOpenWizard}
            className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Unggah CV &amp; Mulai Scrape
          </button>
        )}
      </div>
    );
  }

  const displayed = filtered.slice(0, visibleCount);

  return (
    <div className="space-y-4">
      {/* Tracker Status Tabs */}
      <div
        role="tablist"
        aria-label="Status pelacakan lowongan"
        className="flex flex-wrap items-center gap-1.5 border-b border-[var(--border-subtle)] pb-3"
      >
        {(
          [
            { id: "active", label: "Aktif", count: tabCounts.active },
            { id: "saved", label: "Disimpan", count: tabCounts.saved },
            { id: "applied", label: "Sudah Dilamar", count: tabCounts.applied },
            { id: "dismissed", label: "Diabaikan", count: tabCounts.dismissed },
          ] as const
        ).map((tab) => {
          const selected = trackerTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setTrackerTab(tab.id);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-md border px-3.5 text-xs font-semibold transition-colors ${
                selected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                  : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono-num rounded-sm bg-[var(--bg-surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)]">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Multi-Facet Filter Workbench */}
      <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
        {/* Row 1: Search + Quick Exclude + Score Threshold */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <label htmlFor="job-search-input" className="sr-only">
              Cari lowongan berdasarkan posisi, perusahaan, lokasi, atau skill
            </label>
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]"
              aria-hidden="true"
            />
            <input
              id="job-search-input"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Cari posisi, perusahaan, lokasi, atau skill..."
              className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] py-2 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            />
          </div>

          <div className="lg:col-span-4">
            <label htmlFor="job-exclude-input" className="sr-only">
              Kecualikan kata pada judul posisi
            </label>
            <input
              id="job-exclude-input"
              type="text"
              value={excludeText}
              onChange={(e) => {
                setExcludeText(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Kecualikan judul (misal: Tax, Sales, Finance)"
              className="min-h-[44px] w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] px-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
            />
          </div>

          <div
            role="group"
            aria-label="Filter minimal skor kecocokan"
            className="inline-flex rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-1 lg:col-span-3"
          >
            {[
              { label: "Semua", val: 0 },
              { label: "≥ 50%", val: 50 },
              { label: "≥ 75%", val: 75 },
            ].map((opt) => {
              const active = minScore === opt.val;
              return (
                <button
                  key={opt.val}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setMinScore(opt.val);
                    setVisibleCount(PAGE_SIZE);
                  }}
                  className={`min-h-[38px] flex-1 rounded-sm px-2 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Location + Keyword + Sort + Quick Toggles */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Filter:</span>
          </div>

          <div>
            <label htmlFor="filter-location" className="sr-only">
              Filter lokasi
            </label>
            <select
              id="filter-location"
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="min-h-[44px] max-w-[200px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="all">Semua Lokasi ({uniqueLocations.length})</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-keyword" className="sr-only">
              Filter keyword pencarian
            </label>
            <select
              id="filter-keyword"
              value={keywordFilter}
              onChange={(e) => {
                setKeywordFilter(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              className="min-h-[44px] max-w-[200px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="all">Semua Keyword ({uniqueKeywords.length})</option>
              {uniqueKeywords.map((kw) => (
                <option key={kw} value={kw}>
                  {kw}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="sort-matches" className="sr-only">
              Urutkan hasil
            </label>
            <select
              id="sort-matches"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="min-h-[44px] rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-medium text-[var(--text-primary)]"
            >
              <option value="score">Urut: Skor Tertinggi</option>
              <option value="newest">Urut: Terbaru Diposting</option>
              <option value="salary">Urut: Info Gaji Dulu</option>
            </select>
          </div>

          <button
            type="button"
            aria-pressed={onlyWithSalary}
            onClick={() => {
              setOnlyWithSalary((v) => !v);
              setVisibleCount(PAGE_SIZE);
            }}
            className={`min-h-[44px] rounded-md border px-3 text-xs font-semibold transition-colors ${
              onlyWithSalary
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Ada Info Gaji
          </button>

          {hasAnyAi && (
            <button
              type="button"
              aria-pressed={onlyAiScored}
              onClick={() => {
                setOnlyAiScored((v) => !v);
                setVisibleCount(PAGE_SIZE);
              }}
              className={`min-h-[44px] rounded-md border px-3 text-xs font-semibold transition-colors ${
                onlyAiScored
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Skor AI Saja
            </button>
          )}
        </div>
      </div>

      {/* Results Count + Reset */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-secondary)]">
        <p>
          Menampilkan{" "}
          <strong className="font-mono-num text-[var(--text-primary)]">
            {displayed.length}
          </strong>{" "}
          dari{" "}
          <strong className="font-mono-num text-[var(--text-primary)]">
            {filtered.length}
          </strong>{" "}
          lowongan cocok (total{" "}
          <span className="font-mono-num">{matches.length}</span>).
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-sm px-2 text-xs font-semibold text-[var(--accent-text)] hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset semua filter
          </button>
        )}
      </div>

      {/* Filtered Empty State */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-10 text-center">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Tidak ada lowongan pada tab atau filter saat ini
          </h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {trackerTab !== "active"
              ? "Belum ada lowongan yang ditandai pada kategori ini."
              : "Coba longgarkan filter skor, lokasi, atau kata kunci pencarian Anda."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[var(--border-strong)] bg-[var(--bg-subtle)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Tampilkan Semua Lowongan
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((item) => {
            const job = item.jobs;
            if (!job) return null;

            const currentStatus: MatchStatus = item.user_status || "new";
            const isBusy = updatingId === item.id;

            const scoreTone =
              item.match_score >= 75
                ? {
                    text: "text-[var(--status-good-text)]",
                    bar: "bg-[var(--status-good-text)]",
                    box: "border-[var(--status-good-border)] bg-[var(--status-good-bg)]",
                  }
                : item.match_score >= 50
                  ? {
                      text: "text-[var(--status-warn-text)]",
                      bar: "bg-[var(--status-warn-text)]",
                      box: "border-[var(--status-warn-border)] bg-[var(--status-warn-bg)]",
                    }
                  : {
                      text: "text-[var(--text-secondary)]",
                      bar: "bg-[var(--border-strong)]",
                      box: "border-[var(--border-subtle)] bg-[var(--bg-subtle)]",
                    };

            const engineLabel =
              item.scored_by === "gemini"
                ? "Gemini AI"
                : item.scored_by === "groq"
                  ? "Groq AI"
                  : "Smart Lokal";

            return (
              <article
                key={item.id}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-strong)] sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {/* Left Numeric Score Instrument */}
                  <div
                    className={`flex shrink-0 flex-row items-center justify-between gap-3 rounded-md border px-3.5 py-2.5 sm:w-24 sm:flex-col sm:justify-center sm:py-3 ${scoreTone.box}`}
                  >
                    <div className="flex items-baseline gap-0.5">
                      <span
                        className={`font-mono-num text-2xl font-bold leading-none ${scoreTone.text}`}
                      >
                        {item.match_score}
                      </span>
                      <span
                        className={`font-mono-num text-xs font-semibold ${scoreTone.text}`}
                      >
                        %
                      </span>
                    </div>
                    <div className="w-24 sm:w-full">
                      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-[var(--border-subtle)]">
                        <div
                          className={`h-full ${scoreTone.bar}`}
                          style={{ width: `${Math.max(4, item.match_score)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] sm:text-center">
                        Skor Cocok
                      </p>
                    </div>
                  </div>

                  {/* Main Job Details */}
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold leading-snug text-[var(--text-primary)]">
                            {job.job_title}
                          </h3>
                          <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                            {engineLabel}
                          </span>
                          {job.search_keyword && (
                            <span className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)]">
                              {job.search_keyword}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[var(--text-secondary)]">
                          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                            <Building2
                              className="h-3.5 w-3.5 shrink-0 text-[var(--text-secondary)]"
                              aria-hidden="true"
                            />
                            {job.company_name}
                          </span>
                          {job.job_location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {job.job_location}
                            </span>
                          )}
                          {job.job_salary_range && (
                            <span className="inline-flex items-center gap-1 font-medium text-[var(--status-good-text)]">
                              <Wallet className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                              {job.job_salary_range}
                            </span>
                          )}
                          {job.job_posted_text && <span>· {job.job_posted_text}</span>}
                        </div>
                      </div>

                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                      >
                        Lamar di JobStreet
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>

                    {item.summary_reason && (
                      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                        {item.summary_reason}
                      </p>
                    )}

                    {/* Skills Tags */}
                    {((item.matched_skills && item.matched_skills.length > 0) ||
                      (item.missing_skills && item.missing_skills.length > 0)) && (
                      <div className="flex flex-wrap gap-1.5">
                        {(item.matched_skills || []).map((skill) => (
                          <span
                            key={`m-${skill}`}
                            className="rounded-sm border border-[var(--status-good-border)] bg-[var(--status-good-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-good-text)]"
                          >
                            Cocok: {skill}
                          </span>
                        ))}
                        {(item.missing_skills || []).map((skill) => (
                          <span
                            key={`g-${skill}`}
                            className="rounded-sm border border-[var(--status-warn-border)] bg-[var(--status-warn-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--status-warn-text)]"
                          >
                            Perlu: {skill}
                          </span>
                        ))}
                      </div>
                    )}

                    {item.application_tips && (
                      <div className="flex items-start gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]">
                        <Lightbulb
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                          aria-hidden="true"
                        />
                        <span>{item.application_tips}</span>
                      </div>
                    )}

                    {/* Tracker + Full Description Action Bar */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        aria-expanded={Boolean(expandedJobIds[job.id])}
                        onClick={() => toggleDescription(job.id)}
                        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
                      >
                        <FileText className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
                        <span>
                          {expandedJobIds[job.id]
                            ? "Tutup Deskripsi"
                            : "Lihat Deskripsi Lengkap"}
                        </span>
                        {expandedJobIds[job.id] ? (
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                      </button>

                      {onStatusChange && (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleStatusClick(
                                item.id,
                                currentStatus === "saved" ? "new" : "saved"
                              )
                            }
                            aria-pressed={currentStatus === "saved"}
                            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                              currentStatus === "saved"
                                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{currentStatus === "saved" ? "Tersimpan" : "Simpan"}</span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleStatusClick(
                                item.id,
                                currentStatus === "applied" ? "new" : "applied"
                              )
                            }
                            aria-pressed={currentStatus === "applied"}
                            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-50 ${
                              currentStatus === "applied"
                                ? "border-[var(--status-good-border)] bg-[var(--status-good-bg)] text-[var(--status-good-text)]"
                                : "border-[var(--border-subtle)] bg-[var(--bg-canvas)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {currentStatus === "applied" ? "Sudah Dilamar" : "Tandai Dilamar"}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleStatusClick(
                                item.id,
                                currentStatus === "dismissed" ? "new" : "dismissed"
                              )
                            }
                            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-3 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--status-bad-border)] hover:text-[var(--status-bad-text)] disabled:opacity-50"
                          >
                            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>
                              {currentStatus === "dismissed" ? "Kembalikan" : "Abaikan"}
                            </span>
                          </button>
                        </>
                      )}
                    </div>

                    {/* Expandable Full Job Description Panel (On-Demand Egress Saver) */}
                    {expandedJobIds[job.id] && (
                      <div className="mt-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {loadingDescId === job.id ? (
                          <p>Memuat deskripsi lowongan...</p>
                        ) : descCache[job.id] ? (
                          <div className="max-h-72 overflow-y-auto whitespace-pre-line pr-1 text-[var(--text-primary)]">
                            {descCache[job.id]}
                          </div>
                        ) : (
                          <p>
                            Deskripsi lengkap belum tersedia untuk lowongan ini. Klik Lamar di JobStreet untuk melihat halaman aslinya.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}

          {filtered.length > visibleCount && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg-subtle)]"
              >
                Muat {Math.min(PAGE_SIZE, filtered.length - visibleCount)} Lowongan Lagi
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
