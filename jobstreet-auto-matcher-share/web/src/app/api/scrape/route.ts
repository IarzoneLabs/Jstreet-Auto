import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { triggerGitHubScrapeWorkflow } from "@/lib/github";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode =
      body?.mode === "new_cv" || body?.mode === "new_research"
        ? body.mode
        : "reuse_cv";
    const skipScrape = Boolean(body?.skip_scrape);

    const sb = getSupabaseAdmin();

    const [cvRes, configRes] = await Promise.all([
      sb
        .from("cv_profiles")
        .select("id")
        .eq("is_active", true)
        .limit(1),
      sb
        .from("search_configs")
        .select("id")
        .eq("is_active", true)
        .limit(1),
    ]);

    const activeCvId = cvRes.data?.[0]?.id ?? null;
    const activeConfigId = configRes.data?.[0]?.id ?? null;

    if (!activeConfigId && !skipScrape) {
      return NextResponse.json(
        { error: "Konfigurasi research belum ada. Silakan isi keyword dan lokasi dulu." },
        { status: 400 }
      );
    }

    const { data: run, error } = await sb
      .from("scrape_runs")
      .insert({
        mode,
        trigger_source: "web",
        status: "queued",
        skip_scrape: skipScrape,
        cv_profile_id: activeCvId,
        search_config_id: activeConfigId,
      })
      .select("*")
      .single();

    if (error) throw error;

    const dispatch = await triggerGitHubScrapeWorkflow({
      runId: run.id,
      mode,
      skipScrape,
    });

    return NextResponse.json({
      run,
      triggered: dispatch.triggered,
      message: dispatch.message,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal memulai proses scrape & analisa.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
