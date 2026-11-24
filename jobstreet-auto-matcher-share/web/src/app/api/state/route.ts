import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = getSupabaseAdmin();

    // Auto-expire run yang nyangkut > 30 menit agar status banner tidak macet
    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await sb
      .from("scrape_runs")
      .update({
        status: "failed",
        error_message:
          "Timeout: proses server melebihi 30 menit. Silakan jalankan ulang.",
        finished_at: new Date().toISOString(),
      })
      .in("status", ["queued", "running"])
      .lt("created_at", staleCutoff);

    const [cvRes, configRes, runsRes, jobsCountRes] = await Promise.all([
      sb
        .from("cv_profiles")
        .select(
          "id, filename, storage_path, summary, extracted_skills, preferred_roles, years_experience, is_active, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(15),
      sb
        .from("search_configs")
        .select("*")
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1),
      sb
        .from("scrape_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
      sb.from("jobs").select("id", { count: "exact", head: true }),
    ]);

    if (cvRes.error) throw cvRes.error;
    if (configRes.error) throw configRes.error;
    if (runsRes.error) throw runsRes.error;

    const cvList = cvRes.data ?? [];
    const activeCv = cvList.find((c) => c.is_active) ?? cvList[0] ?? null;
    const activeConfig = configRes.data?.[0] ?? null;
    const recentRuns = runsRes.data ?? [];
    const latestRun = recentRuns[0] ?? null;

    let matches: unknown[] = [];
    if (activeCv) {
      const matchRes = await sb
        .from("job_matches")
        .select(
          `
          id,
          cv_profile_id,
          job_id,
          prefilter_score,
          match_score,
          match_tier,
          summary_reason,
          matched_skills,
          missing_skills,
          application_tips,
          scored_by,
          user_status,
          user_notes,
          created_at,
          jobs (
            id,
            external_job_id,
            search_keyword,
            job_title,
            company_name,
            job_location,
            job_classification,
            job_type,
            job_salary_range,
            job_posted_text,
            job_posted_date,
            job_apply_link,
            job_url,
            scraped_at
          )
        `
        )
        .eq("cv_profile_id", activeCv.id)
        .order("match_score", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300);

      if (matchRes.error) throw matchRes.error;
      matches = matchRes.data ?? [];
    }

    return NextResponse.json({
      activeCv,
      cvList,
      activeConfig,
      latestRun,
      recentRuns,
      matches,
      totalJobsInDb: jobsCountRes.count ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal memuat data dashboard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
