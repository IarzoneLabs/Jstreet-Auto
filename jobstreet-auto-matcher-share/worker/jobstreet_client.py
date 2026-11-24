"""
JobStreet Indonesia public job listing client.
Mengadaptasi struktur data dari jobstreet-scraper tanpa memerlukan Firefox GUI atau OTP manual,
dengan polite rate-limiting dan deteksi blokir/CAPTCHA yang aman (tanpa bypass).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import asyncio
import json
import logging
import random
import re
import time
from typing import Any

from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger(__name__)


class SiteBlockedError(RuntimeError):
    """Dilempar saat situs memunculkan CAPTCHA, WAF, atau HTTP 403/429."""


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://id.jobstreet.com/",
    "Origin": "https://id.jobstreet.com",
}


def clean_text(text: str | None) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[\u2060\u200B-\u200F\uFEFF]", "", text)
    cleaned = cleaned.replace("–", "-").replace("—", "-")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def parse_posted_date(listing_date: str | None, date_text: str | None) -> str | None:
    """Mengembalikan tanggal format YYYY-MM-DD."""
    if listing_date:
        try:
            dt = datetime.fromisoformat(listing_date.replace("Z", "+00:00"))
            return dt.date().isoformat()
        except ValueError:
            pass

    if not date_text:
        return None

    lower = date_text.lower()
    if "30+" in lower:
        return None
    now_wib = datetime.now(timezone(timedelta(hours=7))).date()
    if any(k in lower for k in ("jam", "hour", "menit", "minute", "baru", "just")):
        return now_wib.isoformat()
    if "kemarin" in lower or "yesterday" in lower:
        return (now_wib - timedelta(days=1)).isoformat()

    match = re.search(r"(\d+)", lower)
    if match:
        days_ago = int(match.group(1))
        return (now_wib - timedelta(days=days_ago)).isoformat()
    return None


def _is_challenge_response(status_code: int, body_text: str) -> bool:
    if status_code in (403, 429):
        return True
    sample = body_text[:3000].lower()
    markers = (
        "cf-browser-verification",
        "challenges.cloudflare.com",
        "turnstile",
        "captcha",
        "verify you are human",
        "access denied",
    )
    return any(m in sample for m in markers)


class JobStreetClient:
    SEARCH_API_URL = "https://id.jobstreet.com/api/jobsearch/v5/search"
    BASE_URL = "https://id.jobstreet.com"

    def __init__(
        self,
        delay_min: float = 1.5,
        delay_max: float = 3.5,
        timeout: float = 25.0,
    ):
        self.delay_min = delay_min
        self.delay_max = delay_max
        self.client = httpx.Client(
            headers=DEFAULT_HEADERS,
            timeout=timeout,
            follow_redirects=True,
        )

    def close(self) -> None:
        self.client.close()

    def __enter__(self) -> "JobStreetClient":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()

    def _polite_sleep(self) -> None:
        time.sleep(random.uniform(self.delay_min, self.delay_max))

    def search_page(
        self,
        keyword: str,
        location: str,
        page: int = 1,
        page_size: int = 30,
        sort_by: str = "date",
    ) -> dict[str, Any]:
        params = {
            "siteKey": "ID-Main",
            "sourcesystem": "houston",
            "where": location,
            "keywords": keyword,
            "page": page,
            "pageSize": page_size,
            "locale": "id-ID",
            "sortmode": "ListedDate" if sort_by == "date" else "KeywordRelevance",
        }
        logger.info("Fetching JobStreet search page=%d keyword=%r location=%r", page, keyword, location)
        resp = self.client.get(self.SEARCH_API_URL, params=params)
        if _is_challenge_response(resp.status_code, resp.text):
            raise SiteBlockedError(
                f"JobStreet membatasi akses (HTTP {resp.status_code} / proteksi bot). "
                "Scraper dihentikan dengan aman tanpa bypass."
            )
        resp.raise_for_status()
        return resp.json()

    def _extract_description_from_html(self, html_text: str) -> str | None:
        soup = BeautifulSoup(html_text, "html.parser")

        # 1. Selector utama (sama dengan jobstreet-scraper/scraper.py)
        detail_div = soup.select_one("div[data-automation='jobAdDetails']")
        if detail_div:
            text = clean_text(detail_div.get_text(" ", strip=True))
            if len(text) > 80:
                return text

        # 2. Fallback: JSON-LD JobPosting
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                payload = json.loads(script.string or "")
                items = payload if isinstance(payload, list) else [payload]
                for item in items:
                    if isinstance(item, dict) and item.get("@type") == "JobPosting":
                        desc_html = item.get("description", "")
                        if desc_html:
                            desc_text = clean_text(
                                BeautifulSoup(desc_html, "html.parser").get_text(" ", strip=True)
                            )
                            if len(desc_text) > 80:
                                return desc_text
            except Exception:
                continue
        return None

    def fetch_job_description(self, job_url: str) -> str | None:
        """Mengambil deskripsi lengkap lowongan dari halaman publik JobStreet."""
        try:
            self._polite_sleep()
            headers = {**DEFAULT_HEADERS, "Accept": "text/html,application/xhtml+xml"}
            resp = self.client.get(job_url, headers=headers)
            if _is_challenge_response(resp.status_code, resp.text):
                logger.warning("Detail page dibatasi untuk %s (HTTP %s); pakai teaser.", job_url, resp.status_code)
                return None
            if resp.status_code != 200:
                return None
            return self._extract_description_from_html(resp.text)
        except Exception as exc:
            logger.warning("Gagal mengambil detail %s: %s", job_url, exc)
        return None

    def fetch_job_descriptions_batch(
        self,
        jobs: list[dict[str, Any]],
        concurrency: int = 3,
    ) -> dict[str, str]:
        """
        Polite async batch fetcher (default 3 koneksi paralel + jeda acak sopan).
        Otomatis berhenti aman jika mendeteksi 3x blokir/429 berturut-turut (tanpa bypass).
        """
        if not jobs:
            return {}

        async def _run_async() -> dict[str, str]:
            sem = asyncio.Semaphore(max(1, min(4, concurrency)))
            headers = {**DEFAULT_HEADERS, "Accept": "text/html,application/xhtml+xml"}
            results: dict[str, str] = {}
            blocked_streak = 0
            stop_fetching = False

            async with httpx.AsyncClient(
                headers=headers,
                timeout=25.0,
                follow_redirects=True,
            ) as aclient:
                async def _fetch_one(job: dict[str, Any]) -> None:
                    nonlocal blocked_streak, stop_fetching
                    if stop_fetching:
                        return
                    async with sem:
                        if stop_fetching:
                            return
                        await asyncio.sleep(random.uniform(self.delay_min, self.delay_max))
                        if stop_fetching:
                            return
                        job_url = job.get("job_url") or ""
                        if not job_url:
                            return
                        try:
                            resp = await aclient.get(job_url)
                            if _is_challenge_response(resp.status_code, resp.text):
                                blocked_streak += 1
                                logger.warning(
                                    "Detail page dibatasi (%d/3) untuk %s (HTTP %s)",
                                    blocked_streak,
                                    job_url,
                                    resp.status_code,
                                )
                                if blocked_streak >= 3:
                                    stop_fetching = True
                                    logger.warning(
                                        "Menghentikan batch detail fetch secara aman karena proteksi situs."
                                    )
                                return
                            if resp.status_code == 200:
                                blocked_streak = 0
                                desc = self._extract_description_from_html(resp.text)
                                if desc:
                                    results[str(job["id"])] = desc
                        except Exception as exc:
                            logger.warning("Gagal fetch async detail %s: %s", job_url, exc)

                await asyncio.gather(*(_fetch_one(j) for j in jobs))
            return results

        return asyncio.run(_run_async())

    def normalize_job(self, raw: dict[str, Any], keyword: str) -> dict[str, Any] | None:
        job_id = str(raw.get("id") or "").strip()
        title = clean_text(raw.get("title"))
        advertiser = raw.get("advertiser") or {}
        company_name = clean_text(advertiser.get("description") or raw.get("companyName"))

        if not job_id or not title or not company_name:
            return None

        locations = raw.get("locations") or []
        location_labels = [
            clean_text(loc.get("label"))
            for loc in locations
            if isinstance(loc, dict) and loc.get("label")
        ]
        job_location = ", ".join(location_labels) if location_labels else clean_text(raw.get("location"))

        classifications = raw.get("classifications") or []
        class_parts: list[str] = []
        for c in classifications:
            if isinstance(c, dict):
                main_c = (c.get("classification") or {}).get("description")
                sub_c = (c.get("subclassification") or {}).get("description")
                if main_c:
                    class_parts.append(main_c)
                if sub_c:
                    class_parts.append(sub_c)
        job_classification = " - ".join(dict.fromkeys(class_parts)) or None

        work_types = raw.get("workTypes") or []
        job_type = ", ".join(clean_text(w) for w in work_types if w) or None

        salary_label = clean_text(raw.get("salaryLabel")) or None
        posted_text = clean_text(raw.get("listingDateDisplay")) or None
        posted_date = parse_posted_date(raw.get("listingDate"), posted_text)

        bullet_points = raw.get("bulletPoints") or []
        teaser = clean_text(raw.get("teaser"))
        summary_parts = [p for p in [teaser, *bullet_points] if p]
        fallback_requirements = "\n".join(summary_parts) if summary_parts else None

        job_url = f"{self.BASE_URL}/id/job/{job_id}"
        apply_link = f"{job_url}/apply"

        return {
            "external_job_id": job_id,
            "search_keyword": keyword,
            "job_title": title,
            "company_name": company_name,
            "company_rating": None,
            "job_location": job_location or None,
            "job_classification": job_classification,
            "job_type": job_type,
            "job_salary_range": salary_label,
            "job_posted_text": posted_text,
            "job_posted_date": posted_date,
            "job_applicant_info": None,
            "job_apply_link": apply_link,
            "job_url": job_url,
            "job_requirements": fallback_requirements,
            "company_business_type": None,
            "company_employees_count": None,
            "company_benefits": [],
        }

    def scrape_keywords(
        self,
        keywords: list[str],
        location: str,
        max_pages: int = 3,
        sort_by: str = "date",
        existing_external_ids: set[str] | None = None,
        fetch_full_details: bool = True,
    ) -> list[dict[str, Any]]:
        seen_ids: set[str] = set()
        known_ids = existing_external_ids or set()
        results: list[dict[str, Any]] = []

        for keyword in keywords:
            kw = keyword.strip()
            if not kw:
                continue

            for page in range(1, max_pages + 1):
                if page > 1 or results:
                    self._polite_sleep()

                payload = self.search_page(
                    keyword=kw,
                    location=location,
                    page=page,
                    sort_by=sort_by,
                )
                items = payload.get("data") or []
                if not items:
                    logger.info("Tidak ada lowongan lagi untuk keyword=%r di halaman %d", kw, page)
                    break

                for raw_item in items:
                    record = self.normalize_job(raw_item, keyword=kw)
                    if not record:
                        continue
                    ext_id = record["external_job_id"]
                    if ext_id in seen_ids:
                        continue
                    seen_ids.add(ext_id)

                    # Hemat request: hanya buka detail HTML untuk lowongan baru yang belum ada di DB
                    if fetch_full_details and ext_id not in known_ids:
                        full_desc = self.fetch_job_description(record["job_url"])
                        if full_desc:
                            record["job_requirements"] = full_desc

                    results.append(record)

                total_count = payload.get("totalCount") or 0
                if page * 30 >= total_count:
                    break

        return results
