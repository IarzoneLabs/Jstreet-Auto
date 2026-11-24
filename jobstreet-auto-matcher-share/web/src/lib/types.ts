export interface CvProfile {
  id: string;
  filename: string;
  storage_path: string | null;
  summary: string | null;
  extracted_skills: string[];
  preferred_roles: string[];
  years_experience: number | null;
  is_active: boolean;
  created_at: string;
}

export interface SearchConfig {
  id: string;
  name: string;
  keywords: string[];
  exclude_keywords?: string[];
  location: string;
  max_pages: number;
  sort_by: "date" | "relevance";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapeRun {
  id: string;
  mode: "reuse_cv" | "new_cv" | "new_research" | "scheduled";
  trigger_source: "web" | "schedule" | "manual";
  status: "queued" | "running" | "completed" | "failed" | "blocked_by_site";
  skip_scrape: boolean;
  jobs_scraped: number;
  jobs_new: number;
  jobs_matched: number;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface JobRecord {
  id: string;
  external_job_id: string;
  search_keyword: string | null;
  job_title: string;
  company_name: string;
  job_location: string | null;
  job_classification: string | null;
  job_type: string | null;
  job_salary_range: string | null;
  job_posted_text: string | null;
  job_posted_date: string | null;
  job_apply_link: string | null;
  job_url: string;
  job_requirements: string | null;
  scraped_at: string;
}

export interface JobMatchItem {
  id: string;
  cv_profile_id: string;
  job_id: string;
  prefilter_score: number;
  match_score: number;
  match_tier: "high" | "medium" | "low";
  summary_reason: string | null;
  matched_skills: string[];
  missing_skills: string[];
  application_tips: string | null;
  scored_by: "gemini" | "groq" | "tfidf";
  user_status?: "new" | "saved" | "applied" | "dismissed";
  user_notes?: string | null;
  created_at: string;
  jobs: JobRecord;
}

export interface DashboardState {
  activeCv: CvProfile | null;
  cvList: CvProfile[];
  activeConfig: SearchConfig | null;
  latestRun: ScrapeRun | null;
  recentRuns: ScrapeRun[];
  matches: JobMatchItem[];
  totalJobsInDb: number;
}
