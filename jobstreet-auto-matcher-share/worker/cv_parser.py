"""Ekstraksi teks CV (PDF / DOCX / TXT) dan katalog skill teknis bebas false-positive."""

from __future__ import annotations

import io
import re
from pathlib import Path
from pypdf import PdfReader
from docx import Document

# Skill teknis spesifik (bobot tinggi saat matching)
SPECIFIC_SKILLS = [
    "plant maintenance", "preventive maintenance", "predictive maintenance",
    "corrective maintenance", "sap pm", "cmms", "tpm", "total productive maintenance",
    "reliability", "reliability engineering", "mtbf", "mttr", "work order",
    "spare part", "downtime", "breakdown", "asset management", "oee",
    "continuous improvement", "lean", "lean manufacturing", "six sigma", "kaizen",
    "5s", "pdca", "dmaic", "root cause analysis", "rca", "fmea", "spc",
    "vsm", "value stream mapping", "production monitoring", "industrial engineering",
    "process improvement", "troubleshooting", "calibration", "instrumentation",
    "plc", "scada", "hvac", "boiler", "chiller", "utility", "mechanical", "electrical",
    "iso 9001", "iso 14001", "iso 45001", "iso 55001", "k3", "hse", "ppic",
    "supply chain", "sap", "erp", "power bi", "tableau", "python", "sql",
    "autocad", "solidworks", "machine learning", "data analysis", "data science",
    "pandas", "javascript", "typescript", "react", "next.js", "node.js", "golang",
    "docker", "kubernetes", "aws", "gcp", "supabase", "postgresql", "mysql",
    "project management", "agile", "scrum", "quality assurance", "quality control",
]

# Skill umum (bobot lebih ringan agar tidak memicu false-positive lintas profesi)
GENERIC_SKILLS = [
    "excel", "audit", "manufacturing", "production", "operations",
    "warehouse", "logistics", "maintenance", "engineering",
]

COMMON_SKILL_CATALOG = SPECIFIC_SKILLS + GENERIC_SKILLS


def extract_text_from_bytes(filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        reader = PdfReader(io.BytesIO(data))
        pages = [page.extract_text() or "" for page in reader.pages]
        return clean_cv_text("\n".join(pages))
    if ext == ".docx":
        doc = Document(io.BytesIO(data))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        return clean_cv_text("\n".join(paragraphs))
    return clean_cv_text(data.decode("utf-8", errors="ignore"))


def clean_cv_text(text: str) -> str:
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_skills_heuristic(text: str) -> list[str]:
    lower = text.lower()
    # Bersihkan nama wilayah geografis agar tidak pernah terdeteksi sebagai skill pemrograman
    sanitized = re.sub(
        r"\b(?:east|west|central|south|north)\s+java\b|\bjava\s+island\b",
        " ",
        lower,
    )
    found: list[str] = []
    for skill in COMMON_SKILL_CATALOG:
        pattern = r"(?<![a-z0-9])" + re.escape(skill) + r"(?![a-z0-9])"
        if re.search(pattern, sanitized):
            found.append(skill)
    return found
