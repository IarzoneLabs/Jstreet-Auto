-- Allow 'groq' as a multi-provider AI scoring engine alongside 'gemini' and 'tfidf'
alter table public.job_matches
    drop constraint if exists job_matches_scored_by_check;

alter table public.job_matches
    add constraint job_matches_scored_by_check
    check (scored_by in ('gemini', 'groq', 'tfidf'));
