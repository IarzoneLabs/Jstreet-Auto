-- P1 Upgrades: Negative keywords on search_configs & Job Tracker status on job_matches

alter table public.search_configs
    add column if not exists exclude_keywords text[] not null default '{}';

alter table public.job_matches
    add column if not exists user_status text not null default 'new'
        check (user_status in ('new', 'saved', 'applied', 'dismissed')),
    add column if not exists user_notes text;

create index if not exists idx_job_matches_cv_status_score
    on public.job_matches (cv_profile_id, user_status, match_score desc);
