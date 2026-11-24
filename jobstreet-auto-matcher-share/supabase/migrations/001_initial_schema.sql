-- JobStreet Auto-Scraper & CV Matcher (Supabase Free Tier Schema)
-- Run this in Supabase SQL Editor or via `supabase db push`

create extension if not exists pgcrypto;

-- 1. CV Profiles
create table if not exists public.cv_profiles (
    id uuid primary key default gen_random_uuid(),
    filename text not null,
    storage_path text,
    raw_text text not null,
    summary text,
    extracted_skills text[] not null default '{}',
    preferred_roles text[] not null default '{}',
    years_experience smallint check (years_experience is null or years_experience >= 0),
    is_active boolean not null default false,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_cv_profiles_single_active
    on public.cv_profiles (is_active)
    where is_active = true;

-- 2. Search / Research Configurations
create table if not exists public.search_configs (
    id uuid primary key default gen_random_uuid(),
    name text not null default 'Default Research',
    keywords text[] not null,
    location text not null default 'Indonesia',
    max_pages smallint not null default 3 check (max_pages between 1 and 20),
    sort_by text not null default 'date' check (sort_by in ('date', 'relevance')),
    is_active boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create unique index if not exists idx_search_configs_single_active
    on public.search_configs (is_active)
    where is_active = true;

-- 3. Scrape & Analysis Runs
create table if not exists public.scrape_runs (
    id uuid primary key default gen_random_uuid(),
    mode text not null check (mode in ('reuse_cv', 'new_cv', 'new_research', 'scheduled')),
    trigger_source text not null default 'web' check (trigger_source in ('web', 'schedule', 'manual')),
    status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'blocked_by_site')),
    skip_scrape boolean not null default false,
    cv_profile_id uuid references public.cv_profiles(id) on delete set null,
    search_config_id uuid references public.search_configs(id) on delete set null,
    jobs_scraped integer not null default 0,
    jobs_new integer not null default 0,
    jobs_matched integer not null default 0,
    error_message text,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_scrape_runs_created_at
    on public.scrape_runs (created_at desc);

-- 4. Scraped Jobs (Deduplicated by external_job_id)
create table if not exists public.jobs (
    id uuid primary key default gen_random_uuid(),
    external_job_id text not null unique,
    search_keyword text,
    job_title text not null,
    company_name text not null,
    company_rating text,
    job_location text,
    job_classification text,
    job_type text,
    job_salary_range text,
    job_posted_text text,
    job_posted_date date,
    job_applicant_info text,
    job_apply_link text,
    job_url text not null,
    job_requirements text,
    company_business_type text,
    company_employees_count text,
    company_benefits text[] not null default '{}',
    scraped_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_jobs_scraped_at
    on public.jobs (scraped_at desc);

create index if not exists idx_jobs_keyword
    on public.jobs (search_keyword);

-- 5. Job Matches (CV <-> Job Scores)
create table if not exists public.job_matches (
    id uuid primary key default gen_random_uuid(),
    cv_profile_id uuid not null references public.cv_profiles(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    scrape_run_id uuid references public.scrape_runs(id) on delete set null,
    prefilter_score real not null default 0 check (prefilter_score >= 0 and prefilter_score <= 100),
    match_score smallint not null default 0 check (match_score between 0 and 100),
    match_tier text not null default 'low' check (match_tier in ('high', 'medium', 'low')),
    summary_reason text,
    matched_skills text[] not null default '{}',
    missing_skills text[] not null default '{}',
    application_tips text,
    scored_by text not null default 'tfidf' check (scored_by in ('gemini', 'tfidf')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (cv_profile_id, job_id)
);

create index if not exists idx_job_matches_cv_score
    on public.job_matches (cv_profile_id, match_score desc, created_at desc);

create index if not exists idx_job_matches_job_id
    on public.job_matches (job_id);

-- 6. Row-Level Security (Strict by default; server API & worker use service_role key)
alter table public.cv_profiles enable row level security;
alter table public.search_configs enable row level security;
alter table public.scrape_runs enable row level security;
alter table public.jobs enable row level security;
alter table public.job_matches enable row level security;

-- 7. Private Storage Bucket for uploaded CV files
insert into storage.buckets (id, name, public)
values ('cvs', 'cvs', false)
on conflict (id) do nothing;

-- 8. Seed a default search configuration (same defaults as user's original start.txt)
insert into public.search_configs (name, keywords, location, max_pages, sort_by, is_active)
select
    'Default Research',
    array['Continuous Improvement'],
    'Jawa Timur',
    3,
    'date',
    true
where not exists (select 1 from public.search_configs);
