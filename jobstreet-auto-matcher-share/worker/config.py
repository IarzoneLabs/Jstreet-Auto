import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class WorkerConfig:
    supabase_url: str
    supabase_service_role_key: str
    gemini_api_key: str | None
    gemini_model: str
    groq_api_key: str | None
    groq_model: str
    ai_batch_size: int
    max_ai_match_per_run: int
    max_detail_fetch_per_run: int
    prefilter_min_score: float
    request_delay_min: float
    request_delay_max: float
    ai_delay_seconds: float
    telegram_bot_token: str | None
    telegram_chat_id: str | None
    web_dashboard_url: str | None

    @classmethod
    def from_env(cls) -> "WorkerConfig":
        supabase_url = os.getenv("SUPABASE_URL", "").strip()
        supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not supabase_url or not supabase_key:
            raise ValueError(
                "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib diisi di environment."
            )

        return cls(
            supabase_url=supabase_url,
            supabase_service_role_key=supabase_key,
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip() or None,
            gemini_model=os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip(),
            groq_api_key=os.getenv("GROQ_API_KEY", "").strip() or None,
            groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile").strip(),
            ai_batch_size=max(1, min(10, int(os.getenv("AI_BATCH_SIZE", "5")))),
            max_ai_match_per_run=int(os.getenv("MAX_AI_MATCH_PER_RUN", "25")),
            max_detail_fetch_per_run=int(os.getenv("MAX_DETAIL_FETCH_PER_RUN", "120")),
            prefilter_min_score=float(os.getenv("PREFILTER_MIN_SCORE", "10.0")),
            request_delay_min=float(os.getenv("REQUEST_DELAY_MIN", "0.8")),
            request_delay_max=float(os.getenv("REQUEST_DELAY_MAX", "1.8")),
            ai_delay_seconds=float(os.getenv("AI_DELAY_SECONDS", "2.0")),
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", "").strip() or None,
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", "").strip() or None,
            web_dashboard_url=os.getenv("WEB_DASHBOARD_URL", "").strip() or None,
        )
