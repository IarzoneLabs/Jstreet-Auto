"""Notifikasi Telegram opsional (Rp 0) setelah proses scrape & matching selesai."""

from __future__ import annotations

import logging
from typing import Any
import httpx

logger = logging.getLogger(__name__)


def send_telegram_summary(
    bot_token: str | None,
    chat_id: str | None,
    mode: str,
    status: str,
    jobs_scraped: int,
    jobs_new: int,
    jobs_matched: int,
    top_matches: list[dict[str, Any]],
    error_message: str | None = None,
    web_url: str | None = None,
) -> bool:
    if not bot_token or not chat_id:
        return False

    icon = "✅" if status == "completed" else ("⚠️" if status == "blocked_by_site" else "❌")
    lines = [
        f"{icon} <b>JobStreet Auto-Matcher ({mode})</b>",
        f"Status: <code>{status}</code>",
        f"Lowongan: {jobs_scraped} total ({jobs_new} baru) | Di-match: {jobs_matched}",
    ]

    if error_message:
        lines.append(f"\n⚠️ Catatan: {error_message[:300]}")

    if top_matches:
        lines.append("\n<b>🏆 Top Lowongan Paling Cocok:</b>")
        for idx, item in enumerate(top_matches[:5], start=1):
            score = item.get("match_score", 0)
            title = item.get("job_title", "Lowongan")
            company = item.get("company_name", "-")
            loc = item.get("job_location") or "-"
            url = item.get("job_url") or ""
            lines.append(
                f"{idx}. <b>[{score}%]</b> {title} — {company} ({loc})\n   {url}"
            )

    if web_url:
        lines.append(f"\n🔗 Buka Dashboard: {web_url}")

    payload = {
        "chat_id": chat_id,
        "text": "\n".join(lines),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        resp = httpx.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json=payload,
            timeout=15.0,
        )
        resp.raise_for_status()
        logger.info("Notifikasi Telegram berhasil dikirim.")
        return True
    except Exception as exc:
        logger.warning("Gagal mengirim notifikasi Telegram: %s", exc)
        return False
