import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const jobId = (id || "").trim();
    if (!jobId) {
      return NextResponse.json({ error: "ID lowongan tidak valid." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("jobs")
      .select("id, job_title, company_name, job_requirements, job_url")
      .eq("id", jobId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Lowongan tidak ditemukan." }, { status: 404 });
    }

    return NextResponse.json({
      id: data.id,
      job_requirements: data.job_requirements || "",
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal memuat deskripsi lowongan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
