"""
Smart Hybrid CV <-> Job Matcher (Rp 0 Multi-Provider):
1. Pre-filter cerdas 4-sinyal (Title Relevance + Domain Mismatch Penalty + Bilingual ID/EN TF-IDF + Weighted Skill Overlap).
2. Batch AI Scoring (5 lowongan per 1 prompt JSON -> 5x lebih cepat & hemat kuota RPM):
   - Primary: Google Gemini API Free Tier (strict 30s timeout + model fallback)
   - Secondary: Groq Free Tier (llama-3.3-70b-versatile)
   - Final fallback: Smart Local 4-Signal Scorer
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import logging
import re
import time
from typing import Any

import httpx
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from cv_parser import SPECIFIC_SKILLS, extract_skills_heuristic

logger = logging.getLogger(__name__)

INDONESIAN_STOP_WORDS = {
    "yang", "dan", "di", "ke", "dari", "untuk", "dengan", "pada", "adalah",
    "atau", "ini", "itu", "dalam", "akan", "dapat", "sebagai", "oleh", "secara",
    "serta", "tidak", "juga", "kami", "anda", "kita", "mereka", "saya", "bisa",
    "harus", "memiliki", "pengalaman", "minimal", "tahun", "kerja", "pekerjaan",
    "perusahaan", "posisi", "lowongan", "kualifikasi", "tanggung", "jawab",
    "tugas", "deskripsi", "bidang", "terkait", "baik", "mampu", "bersedia",
    "penempatan", "lokasi", "area", "seperti", "antara", "lain", "lebih",
    "kurang", "sesuai", "melakukan", "membuat", "menjaga", "memastikan",
    "mendukung", "mengelola", "membantu", "bekerja", "sama", "tim", "secara",
    "seluruh", "setiap", "semua", "telah", "sedang", "sudah", "belum", "agar",
    "karena", "jika", "apabila", "namun", "tetapi", "tentang", "melalui",
    "terhadap", "hingga", "sampai", "saat", "bagi", "para", "atas", "bawah",
    "jawa", "timur", "barat", "tengah", "indonesia", "surabaya", "sidoarjo",
    "pasuruan", "gresik", "jakarta", "bandung", "bekasi", "cikarang",
}

BILINGUAL_STOP_WORDS = sorted(set(ENGLISH_STOP_WORDS) | INDONESIAN_STOP_WORDS)

SPECIFIC_SKILL_SET = set(SPECIFIC_SKILLS)

# Domain fungsi pekerjaan yang jelas berbeda; jika muncul di judul lowongan tetapi TIDAK ada di CV,
# berikan penalti besar agar lowongan Finance/Tax/Sales tidak mendominasi hasil Engineering/Maintenance.
UNRELATED_DOMAIN_GROUPS: dict[str, tuple[str, ...]] = {
    "Finance / Tax / Accounting": (
        "tax", "pajak", "accounting", "accountant", "akuntansi", "akuntan",
        "finance", "keuangan", "treasury", "payroll", "bookkeeping", "auditor",
    ),
    "Sales / Marketing / Commercial": (
        "sales", "account manager", "account executive", "business development",
        "marketing", "brand manager", "digital marketing", "telemarketing",
        "merchandiser", "telesales", "key account", "commercial",
    ),
    "HR / Legal / Admin Umum": (
        "human resources", "hrd", "recruiter", "recruitment", "talent acquisition",
        "legal", "lawyer", "notaris", "receptionist", "resepsionis", "sekretaris",
        "secretary", "customer service", "call center",
    ),
    "Hospitality / Retail / Lapangan Non-Teknis": (
        "barista", "chef", "cook", "waiter", "waitress", "kasir", "cashier",
        "driver", "supir", "kurir", "courier", "security", "satpam", "cleaning",
        "housekeeping", "pramuniaga", "spg", "spb", "host live", "content creator",
    ),
}


@dataclass
class MatchResult:
    job_id: str
    prefilter_score: float
    match_score: int
    match_tier: str
    summary_reason: str
    matched_skills: list[str]
    missing_skills: list[str]
    application_tips: str
    scored_by: str  # "gemini" | "groq" | "tfidf"


def compute_tier(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


def _extract_cv_focus_text(cv_text: str) -> str:
    """Ambil 900 karakter teratas CV (nama, headline, summary, peran utama) untuk pencocokan judul."""
    return cv_text[:900].lower()


def _detect_domain_mismatch(job_title: str, cv_focus: str) -> str | None:
    title_lower = f" {job_title.lower()} "
    for domain_name, terms in UNRELATED_DOMAIN_GROUPS.items():
        title_hit = any(
            re.search(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", title_lower)
            for t in terms
        )
        if not title_hit:
            continue
        # Cek apakah CV memang berlatar belakang domain tersebut
        cv_hit = any(
            re.search(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", cv_focus)
            for t in terms
        )
        if not cv_hit:
            return domain_name
    return None


def _compute_title_relevance(job_title: str, cv_focus: str, cv_skills: set[str]) -> tuple[float, list[str]]:
    """Hitung seberapa relevan judul lowongan dengan headline/summary/skill inti CV (0-100)."""
    title_tokens = [
        tok
        for tok in re.findall(r"[a-z0-9+#.]{2,}", job_title.lower())
        if tok not in BILINGUAL_STOP_WORDS
    ]
    if not title_tokens:
        return 0.0, []

    cv_tokens = set(re.findall(r"[a-z0-9+#.]{2,}", cv_focus))
    skill_tokens = set()
    for s in cv_skills:
        skill_tokens.update(re.findall(r"[a-z0-9+#.]{2,}", s.lower()))

    matched_title_terms: list[str] = []
    for tok in dict.fromkeys(title_tokens):
        if tok in cv_tokens or tok in skill_tokens:
            matched_title_terms.append(tok)

    # Cek juga frasa multi-kata dari skill CV yang muncul utuh di judul
    title_lower = job_title.lower()
    phrase_bonus = 0.0
    for s in cv_skills:
        if " " in s and s in title_lower:
            phrase_bonus += 25.0

    ratio = len(matched_title_terms) / max(1, min(len(set(title_tokens)), 4))
    score = min(100.0, ratio * 85.0 + phrase_bonus)
    return round(score, 2), matched_title_terms[:5]


def _build_job_document(job: dict[str, Any]) -> str:
    title = job.get("job_title") or ""
    parts = [
        # Bobot 2x pada judul agar judul generik dengan deskripsi kaya tetap bisa unggul
        title,
        title,
        job.get("job_classification") or "",
        job.get("job_type") or "",
        job.get("job_requirements") or "",
    ]
    return "\n".join(p for p in parts if p).strip()


def compute_prefilter_scores(
    cv_text: str,
    cv_skills: list[str],
    jobs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Menghitung skor cerdas 4-sinyal (0-100) untuk seluruh lowongan secara lokal."""
    if not jobs:
        return []

    detected_from_cv = set(extract_skills_heuristic(cv_text))
    normalized_cv_skills = {
        s.lower().strip()
        for s in cv_skills
        if s.strip() and s.lower().strip() != "java"
    } | detected_from_cv

    cv_focus = _extract_cv_focus_text(cv_text)
    job_docs = [_build_job_document(j) for j in jobs]
    corpus = [cv_text, *job_docs]

    vectorizer = TfidfVectorizer(
        stop_words=BILINGUAL_STOP_WORDS,
        ngram_range=(1, 2),
        max_features=6000,
        sublinear_tf=True,
    )
    tfidf_matrix = vectorizer.fit_transform(corpus)
    similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:]).flatten()

    scored_items: list[dict[str, Any]] = []
    for idx, job in enumerate(jobs):
        job_title = job.get("job_title") or ""
        doc_lower = job_docs[idx].lower()
        tfidf_pct = float(similarities[idx]) * 100.0

        # 1. Title relevance (25%)
        title_score, matched_title_terms = _compute_title_relevance(
            job_title, cv_focus, normalized_cv_skills
        )

        # 2. Description & Weighted Skill Depth (45%): skill teknis spesifik berbobot 2x dibanding kata umum
        job_detected_skills = set(extract_skills_heuristic(doc_lower))
        matched = sorted(normalized_cv_skills & job_detected_skills)
        missing = sorted(job_detected_skills - normalized_cv_skills)

        if job_detected_skills:
            total_w = sum(2.0 if s in SPECIFIC_SKILL_SET else 1.0 for s in job_detected_skills)
            matched_w = sum(2.0 if s in SPECIFIC_SKILL_SET else 1.0 for s in matched)
            skill_overlap_pct = (matched_w / max(1.0, total_w)) * 100.0
            specific_matched_cnt = sum(1 for s in matched if s in SPECIFIC_SKILL_SET)
            if specific_matched_cnt >= 4:
                skill_overlap_pct = min(100.0, skill_overlap_pct + 18.0)
            elif specific_matched_cnt >= 2:
                skill_overlap_pct = min(100.0, skill_overlap_pct + 10.0)
        else:
            skill_overlap_pct = min(100.0, tfidf_pct * 1.9)

        # 3. Bilingual Full-Description TF-IDF (30%)
        calibrated_tfidf = min(100.0, tfidf_pct * 2.5)

        raw_score = (
            0.45 * skill_overlap_pct
            + 0.30 * calibrated_tfidf
            + 0.25 * title_score
        )

        # 4. Domain mismatch penalty (-35 poin jika judul jelas beda profesi seperti Tax/Accounting/Sales)
        mismatch_domain = _detect_domain_mismatch(job_title, cv_focus)
        if mismatch_domain:
            raw_score = max(0.0, raw_score - 35.0)

        final_score = round(min(100.0, max(0.0, raw_score)), 2)

        scored_items.append(
            {
                "job": job,
                "prefilter_score": final_score,
                "title_score": title_score,
                "matched_title_terms": matched_title_terms,
                "mismatch_domain": mismatch_domain,
                "matched_skills": matched[:10],
                "missing_skills": missing[:10],
            }
        )

    scored_items.sort(key=lambda x: x["prefilter_score"], reverse=True)
    return scored_items


def _parse_json_payload(text: str) -> Any:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    return json.loads(cleaned)


def _build_batch_prompt(cv_text: str, jobs_batch: list[dict[str, Any]]) -> str:
    jobs_blocks: list[str] = []
    for idx, job in enumerate(jobs_batch, start=1):
        jobs_blocks.append(
            f"""[JOB #{idx}]
job_id: {job['id']}
Judul: {job.get('job_title')}
Perusahaan: {job.get('company_name')}
Lokasi: {job.get('job_location') or '-'}
Klasifikasi: {job.get('job_classification') or '-'}
Gaji: {job.get('job_salary_range') or 'Tidak dicantumkan'}
Deskripsi Lengkap (Responsibilities & Requirements):
{(job.get('job_requirements') or '')[:3000]}"""
        )

    joined_jobs = "\n\n---\n\n".join(jobs_blocks)
    return f"""Anda adalah HR Recruiter & Career Coach senior di Indonesia.
Evaluasi kecocokan CV kandidat berikut terhadap {len(jobs_batch)} lowongan kerja dari JobStreet dalam Bahasa Indonesia.

ATURAN PENILAIAN KETAT (BERBASIS ISI DESKRIPSI LENGKAP):
- Baca mendalam bagian Responsibilities, Requirements, dan skill teknis di deskripsi lowongan, bukan sekadar judul posisi.
- Jika judul posisi terdengar generik (misal Staff Engineering / Operations Supervisor) tetapi isi tanggung jawab & kualifikasinya sangat sesuai dengan skill dan pengalaman CV kandidat, tetap berikan skor tinggi (75-95).
- Sebaliknya, jika fungsi jabatan jelas berbeda dari latar belakang CV (misal Finance/Tax/Accounting/Sales padahal kandidat adalah Plant Maintenance/Engineering), berikan skor rendah (< 35) meskipun sama-sama menyebut SAP atau Excel.
- Skor 80-100: tanggung jawab & skill inti sangat selaras. Skor 60-79: relevan dengan beberapa gap kecil. Skor 40-59: satu industri tapi peran berbeda. Skor < 40: kurang relevan.

=== CV KANDIDAT ===
{cv_text[:4500]}

=== DAFTAR LOWONGAN ===
{joined_jobs}

Kembalikan HANYA JSON valid dengan struktur persis:
{{
  "results": [
    {{
      "job_id": "<salin persis job_id dari daftar di atas>",
      "match_score": 0-100,
      "summary_reason": "2 kalimat ringkas kenapa cocok atau kurang cocok",
      "matched_skills": ["skill1", "skill2"],
      "missing_skills": ["skill_kurang1", "skill_kurang2"],
      "application_tips": "1 kalimat saran konkret untuk melamar posisi ini"
    }}
  ]
}}""".strip()


def _normalize_batch_response(raw_payload: Any) -> dict[str, dict[str, Any]]:
    items = raw_payload.get("results") if isinstance(raw_payload, dict) else raw_payload
    if not isinstance(items, list):
        return {}

    parsed_by_id: dict[str, dict[str, Any]] = {}
    for entry in items:
        if not isinstance(entry, dict):
            continue
        jid = str(entry.get("job_id") or "").strip()
        if not jid:
            continue
        score = max(0, min(100, int(round(float(entry.get("match_score", 0))))))
        parsed_by_id[jid] = {
            "match_score": score,
            "summary_reason": str(entry.get("summary_reason") or "").strip(),
            "matched_skills": [
                str(s).strip() for s in (entry.get("matched_skills") or []) if str(s).strip()
            ][:10],
            "missing_skills": [
                str(s).strip() for s in (entry.get("missing_skills") or []) if str(s).strip()
            ][:10],
            "application_tips": str(entry.get("application_tips") or "").strip(),
        }
    return parsed_by_id


def score_batch_with_gemini(
    cv_text: str,
    jobs_batch: list[dict[str, Any]],
    client: Any,
    model_name: str = "gemini-flash-latest",
) -> tuple[dict[str, dict[str, Any]], str]:
    from google.genai import types

    prompt = _build_batch_prompt(cv_text, jobs_batch)
    candidate_models = list(
        dict.fromkeys([model_name, "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"])
    )
    last_err: Exception | None = None
    response = None
    used_model = model_name

    for m in candidate_models:
        try:
            response = client.models.generate_content(
                model=m,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    response_mime_type="application/json",
                ),
            )
            used_model = m
            break
        except Exception as exc:
            last_err = exc
            err_msg = str(exc)
            if "404" in err_msg or "NOT_FOUND" in err_msg:
                logger.warning("Model Gemini %s tidak tersedia (404), coba fallback...", m)
                continue
            raise

    if response is None:
        raise last_err or RuntimeError("Semua model Gemini gagal dipanggil.")

    payload = _parse_json_payload(response.text or "{}")
    return _normalize_batch_response(payload), used_model


def score_batch_with_groq(
    cv_text: str,
    jobs_batch: list[dict[str, Any]],
    api_key: str,
    model_name: str = "llama-3.3-70b-versatile",
) -> dict[str, dict[str, Any]]:
    prompt = _build_batch_prompt(cv_text, jobs_batch)
    resp = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model_name,
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": "Anda adalah HR Recruiter profesional di Indonesia. Selalu kembalikan JSON valid.",
                },
                {"role": "user", "content": prompt},
            ],
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    payload = _parse_json_payload(content or "{}")
    return _normalize_batch_response(payload)


def _make_local_result(item: dict[str, Any]) -> MatchResult:
    job = item["job"]
    pre_score = float(item["prefilter_score"])
    fallback_score = int(round(pre_score))
    mismatch = item.get("mismatch_domain")
    title_terms = item.get("matched_title_terms") or []
    matched = item.get("matched_skills") or []

    if mismatch:
        reason = (
            f"Domain jabatan ({mismatch}) kurang selaras dengan fokus profil CV Anda, "
            f"meskipun ada beberapa kata kunci umum yang sama."
        )
        tips = "Pertimbangkan fokus ke lowongan yang peran intinya lebih dekat dengan pengalaman utama Anda."
    elif title_terms and matched:
        reason = (
            f"Judul posisi selaras dengan profil Anda ({', '.join(title_terms[:3])}) "
            f"dan memenuhi {len(matched)} skill relevan ({', '.join(matched[:4])})."
        )
        tips = "Tonjolkan pencapaian terukur yang terkait langsung dengan skill cocok pada ringkasan CV Anda."
    elif matched:
        reason = f"Memenuhi {len(matched)} skill dari kualifikasi lowongan ({', '.join(matched[:5])})."
        tips = "Sesuaikan kata kunci pengalaman di CV dengan persyaratan utama pada deskripsi lowongan."
    else:
        reason = "Kemiripan konteks umum dengan profil CV Anda masih terbatas."
        tips = "Periksa kembali deskripsi lowongan untuk memastikan kesesuaian dengan target karier Anda."

    return MatchResult(
        job_id=str(job["id"]),
        prefilter_score=pre_score,
        match_score=fallback_score,
        match_tier=compute_tier(fallback_score),
        summary_reason=reason,
        matched_skills=matched,
        missing_skills=item.get("missing_skills") or [],
        application_tips=tips,
        scored_by="tfidf",
    )


def run_hybrid_matching(
    cv_text: str,
    cv_skills: list[str],
    jobs: list[dict[str, Any]],
    gemini_api_key: str | None = None,
    gemini_model: str = "gemini-flash-latest",
    groq_api_key: str | None = None,
    groq_model: str = "llama-3.3-70b-versatile",
    ai_batch_size: int = 5,
    max_ai_match: int = 25,
    prefilter_min_score: float = 15.0,
    ai_delay_seconds: float = 2.0,
) -> list[MatchResult]:
    prefiltered = compute_prefilter_scores(cv_text=cv_text, cv_skills=cv_skills, jobs=jobs)
    results_by_id: dict[str, MatchResult] = {}

    # Hanya kirim kandidat yang tidak kena domain mismatch & lolos threshold ke AI
    ai_candidates = [
        item
        for item in prefiltered
        if not item.get("mismatch_domain")
        and float(item["prefilter_score"]) >= prefilter_min_score
    ][:max_ai_match]

    genai_client = None
    if gemini_api_key and ai_candidates:
        from google import genai
        from google.genai import types

        genai_client = genai.Client(
            api_key=gemini_api_key,
            http_options=types.HttpOptions(timeout=30_000),
        )

    gemini_disabled = genai_client is None
    groq_disabled = not bool(groq_api_key)
    gemini_failures = 0
    groq_failures = 0
    active_gemini_model = gemini_model

    for batch_idx in range(0, len(ai_candidates), ai_batch_size):
        if gemini_disabled and groq_disabled:
            break

        batch_items = ai_candidates[batch_idx : batch_idx + ai_batch_size]
        batch_jobs = [it["job"] for it in batch_items]

        if batch_idx > 0:
            time.sleep(ai_delay_seconds)

        ai_map: dict[str, dict[str, Any]] = {}
        provider_used: str | None = None

        if not gemini_disabled and genai_client is not None:
            try:
                ai_map, active_gemini_model = score_batch_with_gemini(
                    cv_text=cv_text,
                    jobs_batch=batch_jobs,
                    client=genai_client,
                    model_name=active_gemini_model,
                )
                if ai_map:
                    provider_used = "gemini"
                    gemini_failures = 0
                    logger.info(
                        "Batch AI Gemini (%s) berhasil menilai %d/%d lowongan.",
                        active_gemini_model,
                        len(ai_map),
                        len(batch_jobs),
                    )
            except Exception as exc:
                gemini_failures += 1
                logger.warning(
                    "Batch Gemini gagal (%d/2), mencoba fallback Groq: %s",
                    gemini_failures,
                    exc,
                )
                if gemini_failures >= 2:
                    gemini_disabled = True

        if not provider_used and not groq_disabled and groq_api_key:
            try:
                ai_map = score_batch_with_groq(
                    cv_text=cv_text,
                    jobs_batch=batch_jobs,
                    api_key=groq_api_key,
                    model_name=groq_model,
                )
                if ai_map:
                    provider_used = "groq"
                    groq_failures = 0
                    logger.info(
                        "Batch AI Groq (%s) berhasil menilai %d/%d lowongan.",
                        groq_model,
                        len(ai_map),
                        len(batch_jobs),
                    )
            except Exception as exc:
                groq_failures += 1
                logger.warning("Batch Groq gagal (%d/2): %s", groq_failures, exc)
                if groq_failures >= 2:
                    groq_disabled = True

        if provider_used:
            for it in batch_items:
                jid = str(it["job"]["id"])
                if jid in ai_map:
                    ai_res = ai_map[jid]
                    score = ai_res["match_score"]
                    results_by_id[jid] = MatchResult(
                        job_id=jid,
                        prefilter_score=float(it["prefilter_score"]),
                        match_score=score,
                        match_tier=compute_tier(score),
                        summary_reason=ai_res["summary_reason"],
                        matched_skills=ai_res["matched_skills"],
                        missing_skills=ai_res["missing_skills"],
                        application_tips=ai_res["application_tips"],
                        scored_by=provider_used,
                    )

    final_results: list[MatchResult] = []
    for item in prefiltered:
        jid = str(item["job"]["id"])
        if jid in results_by_id:
            final_results.append(results_by_id[jid])
        else:
            final_results.append(_make_local_result(item))

    final_results.sort(key=lambda r: r.match_score, reverse=True)
    return final_results
