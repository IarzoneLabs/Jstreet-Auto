"""
Orchestrator utama untuk GitHub Actions / CLI lokal:
1. Membaca CV aktif & konfigurasi research aktif dari Supabase
2. (Opsional) Scrape lowongan publik terbaru dari JobStreet
3. Menjalankan Hybrid Matching (TF-IDF lokal + Gemini AI Free Tier)
4. Menyimpan hasil & memperbarui status run di Supabase
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import logging
import signal
import sys
from typing import Any

from supabase import create_client, Client

from config import WorkerConfig
from jobstreet_client import JobStreetClient, SiteBlockedError
from matcher import compute_prefilter_scores, run_hybrid_matching
from notifier import send_telegram_summary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("pipeline")


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_active_cv(sb: Client) -> dict[str, Any] | None:
    res = (
        sb.table("cv_profiles")
        .select("*")
        .eq("is_active", True)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def get_active_search_config(sb: Client) -> dict[str, Any] | None:
    res = (
        sb.table("search_configs")
        .select("*")
        .eq("is_active", True)
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def ensure_run_record(
    sb: Client,
    run_id: str | None,
    mode: str,
    skip_scrape: bool,
    cv_id: str | None,
    config_id: str | None,
) -> str:
    if run_id:
        sb.table("scrape_runs").update(
            {
                "status": "running",
                "started_at": utcnow_iso(),
                "cv_profile_id": cv_id,
                "search_config_id": config_id,
            }
        ).eq("id", run_id).execute()
        return run_id

    trigger_source = "schedule" if mode == "scheduled" else "manual"
    inserted = (
        sb.table("scrape_runs")
        .insert(
            {
                "mode": mode,
                "trigger_source": trigger_source,
                "status": "running",
                "skip_scrape": skip_scrape,
                "cv_profile_id": cv_id,
                "search_config_id": config_id,
                "started_at": utcnow_iso(),
            }
        )
        .execute()
    )
    return inserted.data[0]["id"]


def update_run(sb: Client, run_id: str, **fields: Any) -> None:
    sb.table("scrape_runs").update(fields).eq("id", run_id).execute()


def cleanup_stale_runs(sb: Client, current_run_id: str | None) -> None:
    """Tandai run yang nyangkut >30 menit sebagai failed agar UI tidak terus-terusan loading."""
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=30)).isoformat()
    stale = (
        sb.table("scrape_runs")
        .select("id")
        .in_("status", ["queued", "running"])
        .lt("created_at", cutoff)
        .execute()
    )
    for row in stale.data or []:
        if row["id"] == current_run_id:
            continue
        update_run(
            sb,
            row["id"],
            status="failed",
            error_message="Timeout: proses server melebihi 30 menit dan dihentikan otomatis.",
            finished_at=utcnow_iso(),
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="JobStreet Auto-Scraper & CV Matcher Worker")
    parser.add_argument("--run-id", type=str, default=None, help="UUID scrape_runs dari Web UI")
    parser.add_argument(
        "--mode",
        type=str,
        default="scheduled",
        choices=["reuse_cv", "new_cv", "new_research", "scheduled"],
    )
    parser.add_argument(
        "--skip-scrape",
        action="store_true",
        help="Lewati scraping, hanya re-match lowongan yang ada di DB ke CV aktif",
    )
    args = parser.parse_args()

    cfg = WorkerConfig.from_env()
    sb = create_client(cfg.supabase_url, cfg.supabase_service_role_key)

    cleanup_stale_runs(sb, args.run_id)

    active_cv = get_active_cv(sb)
    active_config = get_active_search_config(sb)

    run_id = ensure_run_record(
        sb=sb,
        run_id=args.run_id,
        mode=args.mode,
        skip_scrape=args.skip_scrape,
        cv_id=active_cv["id"] if active_cv else None,
        config_id=active_config["id"] if active_config else None,
    )

    def _handle_sigterm(signum: int, _frame: Any) -> None:
        logger.warning("Menerima sinyal %d, menandai run gagal secara rapi.", signum)
        update_run(
            sb,
            run_id,
            status="failed",
            error_message="Worker dihentikan oleh server (timeout/cancel).",
            finished_at=utcnow_iso(),
        )
        sys.exit(143)

    signal.signal(signal.SIGTERM, _handle_sigterm)

    jobs_scraped = 0
    jobs_new = 0
    jobs_matched = 0
    top_matches_for_notif: list[dict[str, Any]] = []

    try:
        # 1. Fast API Scrape (tanpa fetch HTML per-lowongan dulu -> 900 lowongan hanya ~45 detik!)
        if not args.skip_scrape:
            if not active_config:
                raise RuntimeError("Belum ada konfigurasi research aktif di database.")

            existing_res = sb.table("jobs").select("external_job_id").execute()
            existing_ids = {row["external_job_id"] for row in (existing_res.data or [])}

            keywords = active_config.get("keywords") or []
            location = active_config.get("location") or "Indonesia"
            max_pages = int(active_config.get("max_pages") or 3)
            sort_by = active_config.get("sort_by") or "date"

            with JobStreetClient(
                delay_min=cfg.request_delay_min,
                delay_max=cfg.request_delay_max,
            ) as client:
                scraped = client.scrape_keywords(
                    keywords=keywords,
                    location=location,
                    max_pages=max_pages,
                    sort_by=sort_by,
                    existing_external_ids=existing_ids,
                    fetch_full_details=False,
                )

            jobs_scraped = len(scraped)
            new_only = [j for j in scraped if j["external_job_id"] not in existing_ids]
            jobs_new = len(new_only)

            if scraped:
                now_ts = utcnow_iso()
                for job in scraped:
                    job["updated_at"] = now_ts
                for i in range(0, len(scraped), 50):
                    chunk = scraped[i : i + 50]
                    sb.table("jobs").upsert(chunk, on_conflict="external_job_id").execute()

            # Update progres di DB segera setelah fase scrape selesai
            update_run(sb, run_id, jobs_scraped=jobs_scraped, jobs_new=jobs_new)
            logger.info("Fase 1 (Fast Search Scrape) selesai: total=%d, baru=%d", jobs_scraped, jobs_new)

        # 2. Smart Enrichment + Hybrid Matching terhadap CV aktif
        if active_cv:
            cv_id = active_cv["id"]
            already_matched_res = (
                sb.table("job_matches")
                .select("job_id, scored_by")
                .eq("cv_profile_id", cv_id)
                .execute()
            )
            ai_scored_ids = {
                row["job_id"]
                for row in (already_matched_res.data or [])
                if row.get("scored_by") in ("gemini", "groq")
            }
            all_matched_ids = {row["job_id"] for row in (already_matched_res.data or [])}

            recent_jobs_res = (
                sb.table("jobs")
                .select("*")
                .order("scraped_at", desc=True)
                .limit(350)
                .execute()
            )
            recent_jobs = recent_jobs_res.data or []

            # Terapkan exclude_keywords (Negative Keywords) dari search_config aktif
            exclude_terms = [
                k.strip().lower()
                for k in ((active_config or {}).get("exclude_keywords") or [])
                if k and k.strip()
            ]
            if exclude_terms:
                before_cnt = len(recent_jobs)
                recent_jobs = [
                    j
                    for j in recent_jobs
                    if not any(
                        term in (j.get("job_title") or "").lower()
                        for term in exclude_terms
                    )
                ]
                logger.info(
                    "Filter negative keywords (%s): %d -> %d lowongan",
                    ", ".join(exclude_terms),
                    before_cnt,
                    len(recent_jobs),
                )

            unmatched_jobs = [j for j in recent_jobs if j["id"] not in all_matched_ids]

            # Jika belum ada match AI sama sekali untuk CV aktif (atau sedang re-match),
            # ikutkan Top-N lowongan yang masih 'tfidf' agar otomatis ter-upgrade ke Gemini/Groq AI
            if (cfg.gemini_api_key or cfg.groq_api_key) and len(ai_scored_ids) < cfg.max_ai_match_per_run:
                tfidf_upgrade_candidates = [
                    j for j in recent_jobs if j["id"] in all_matched_ids and j["id"] not in ai_scored_ids
                ]
                seen_u = {j["id"] for j in unmatched_jobs}
                for j in tfidf_upgrade_candidates:
                    if j["id"] not in seen_u:
                        unmatched_jobs.append(j)
                        seen_u.add(j["id"])

            if unmatched_jobs:
                # Fase 2a: Pre-filter cepat di RAM, lalu fetch deskripsi HTML lengkap HANYA untuk Top-N kandidat
                prelim = compute_prefilter_scores(
                    cv_text=active_cv["raw_text"],
                    cv_skills=active_cv.get("extracted_skills") or [],
                    jobs=unmatched_jobs,
                )
                candidates_to_enrich = [
                    item["job"]
                    for item in prelim[: cfg.max_detail_fetch_per_run]
                    if len(item["job"].get("job_requirements") or "") < 450
                ]

                if candidates_to_enrich:
                    logger.info(
                        "Fase 2a: Mengambil deskripsi lengkap (async 3 paralel) untuk %d kandidat teratas...",
                        len(candidates_to_enrich),
                    )
                    with JobStreetClient(
                        delay_min=cfg.request_delay_min,
                        delay_max=cfg.request_delay_max,
                    ) as client:
                        desc_map = client.fetch_job_descriptions_batch(
                            candidates_to_enrich,
                            concurrency=3,
                        )
                        now_enrich_ts = utcnow_iso()
                        for job in candidates_to_enrich:
                            full_desc = desc_map.get(str(job["id"]))
                            if full_desc:
                                job["job_requirements"] = full_desc
                                sb.table("jobs").update(
                                    {
                                        "job_requirements": full_desc,
                                        "updated_at": now_enrich_ts,
                                    }
                                ).eq("id", job["id"]).execute()
                        logger.info(
                            "Fase 2a selesai: %d/%d deskripsi lengkap berhasil disedot & disimpan.",
                            len(desc_map),
                            len(candidates_to_enrich),
                        )

                # Fase 2b: Batch Hybrid Matching (TF-IDF + Batch Gemini/Groq AI pada Top-N)
                logger.info(
                    "Fase 2b: Mencocokkan %d lowongan terhadap CV %s (batch=%d)",
                    len(unmatched_jobs),
                    active_cv["filename"],
                    cfg.ai_batch_size,
                )
                match_results = run_hybrid_matching(
                    cv_text=active_cv["raw_text"],
                    cv_skills=active_cv.get("extracted_skills") or [],
                    jobs=unmatched_jobs,
                    gemini_api_key=cfg.gemini_api_key,
                    gemini_model=cfg.gemini_model,
                    groq_api_key=cfg.groq_api_key,
                    groq_model=cfg.groq_model,
                    ai_batch_size=cfg.ai_batch_size,
                    max_ai_match=cfg.max_ai_match_per_run,
                    prefilter_min_score=cfg.prefilter_min_score,
                    ai_delay_seconds=cfg.ai_delay_seconds,
                )

                now_ts = utcnow_iso()
                rows = [
                    {
                        "cv_profile_id": cv_id,
                        "job_id": r.job_id,
                        "scrape_run_id": run_id,
                        "prefilter_score": r.prefilter_score,
                        "match_score": r.match_score,
                        "match_tier": r.match_tier,
                        "summary_reason": r.summary_reason,
                        "matched_skills": r.matched_skills,
                        "missing_skills": r.missing_skills,
                        "application_tips": r.application_tips,
                        "scored_by": r.scored_by,
                        "updated_at": now_ts,
                    }
                    for r in match_results
                ]
                for i in range(0, len(rows), 50):
                    sb.table("job_matches").upsert(
                        rows[i : i + 50],
                        on_conflict="cv_profile_id,job_id",
                    ).execute()
                jobs_matched = len(rows)
                job_lookup = {str(j["id"]): j for j in unmatched_jobs}
                for r in match_results[:5]:
                    j = job_lookup.get(r.job_id, {})
                    top_matches_for_notif.append(
                        {
                            "match_score": r.match_score,
                            "job_title": j.get("job_title"),
                            "company_name": j.get("company_name"),
                            "job_location": j.get("job_location"),
                            "job_url": j.get("job_url"),
                        }
                    )
                logger.info("Matching selesai: %d lowongan tersimpan.", jobs_matched)
            else:
                logger.info("Semua lowongan terbaru sudah pernah di-match untuk CV aktif ini.")
        else:
            logger.warning("Belum ada CV aktif; proses matching dilewati.")

        update_run(
            sb,
            run_id,
            status="completed",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            finished_at=utcnow_iso(),
        )
        send_telegram_summary(
            bot_token=cfg.telegram_bot_token,
            chat_id=cfg.telegram_chat_id,
            mode=args.mode,
            status="completed",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            top_matches=top_matches_for_notif,
            web_url=cfg.web_dashboard_url,
        )
        return 0

    except SiteBlockedError as exc:
        logger.error("Diblokir oleh proteksi situs: %s", exc)
        update_run(
            sb,
            run_id,
            status="blocked_by_site",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            error_message=str(exc),
            finished_at=utcnow_iso(),
        )
        send_telegram_summary(
            bot_token=cfg.telegram_bot_token,
            chat_id=cfg.telegram_chat_id,
            mode=args.mode,
            status="blocked_by_site",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            top_matches=top_matches_for_notif,
            error_message=str(exc),
            web_url=cfg.web_dashboard_url,
        )
        return 2

    except Exception as exc:
        logger.exception("Pipeline gagal: %s", exc)
        update_run(
            sb,
            run_id,
            status="failed",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            error_message=str(exc)[:1000],
            finished_at=utcnow_iso(),
        )
        send_telegram_summary(
            bot_token=cfg.telegram_bot_token,
            chat_id=cfg.telegram_chat_id,
            mode=args.mode,
            status="failed",
            jobs_scraped=jobs_scraped,
            jobs_new=jobs_new,
            jobs_matched=jobs_matched,
            top_matches=top_matches_for_notif,
            error_message=str(exc)[:300],
            web_url=cfg.web_dashboard_url,
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
