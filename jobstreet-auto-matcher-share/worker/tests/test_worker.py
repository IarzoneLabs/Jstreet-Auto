import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from cv_parser import extract_skills_heuristic
from jobstreet_client import parse_posted_date
from matcher import compute_prefilter_scores


def test_extract_skills_heuristic():
    cv = "Experienced Continuous Improvement Engineer skilled in Lean, Six Sigma, Excel, Power BI, and Python."
    skills = extract_skills_heuristic(cv)
    assert "continuous improvement" in skills
    assert "six sigma" in skills
    assert "python" in skills


def test_parse_posted_date():
    assert parse_posted_date("2026-11-20T08:00:00Z", None) == "2026-11-20"
    assert parse_posted_date(None, "30+ hari yang lalu") is None
    assert parse_posted_date(None, "Diposting 2 jam yang lalu") is not None


def test_prefilter_ranks_relevant_job_higher():
    cv = "Industrial Engineer experienced in Continuous Improvement, Lean Manufacturing, Kaizen, Six Sigma, OEE, Excel, and Power BI."
    skills = extract_skills_heuristic(cv)
    jobs = [
        {
            "id": "job-1",
            "job_title": "Continuous Improvement Specialist",
            "company_name": "PT Manufaktur Maju",
            "job_location": "Surabaya",
            "job_classification": "Manufacturing",
            "job_type": "Full time",
            "job_requirements": "Memahami Lean Manufacturing, Kaizen, Six Sigma, OEE, dan Power BI.",
        },
        {
            "id": "job-2",
            "job_title": "Barista Coffee Shop",
            "company_name": "Kopi Nusantara",
            "job_location": "Jakarta",
            "job_classification": "Hospitality",
            "job_type": "Part time",
            "job_requirements": "Membuat kopi latte art dan melayani pelanggan di kasir.",
        },
    ]
    ranked = compute_prefilter_scores(cv, skills, jobs)
    assert ranked[0]["job"]["id"] == "job-1"
    assert ranked[0]["prefilter_score"] > ranked[1]["prefilter_score"]
