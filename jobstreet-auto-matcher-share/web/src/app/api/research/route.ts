import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawKeywords: string[] = Array.isArray(body?.keywords)
      ? body.keywords
      : String(body?.keywords || "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);

    const rawExclude: string[] = Array.isArray(body?.exclude_keywords)
      ? body.exclude_keywords
      : String(body?.exclude_keywords || "")
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);

    const location = String(body?.location || "Indonesia").trim();
    const maxPages = Math.max(1, Math.min(20, Number(body?.max_pages || 3)));
    const sortBy = body?.sort_by === "relevance" ? "relevance" : "date";
    const name = String(body?.name || `Research ${rawKeywords[0] || "Baru"}`).trim();

    if (rawKeywords.length === 0) {
      return NextResponse.json(
        { error: "Minimal 1 kata kunci posisi wajib diisi." },
        { status: 400 }
      );
    }

    const sb = getSupabaseAdmin();
    await sb.from("search_configs").update({ is_active: false }).eq("is_active", true);

    const { data, error } = await sb
      .from("search_configs")
      .insert({
        name,
        keywords: rawKeywords,
        exclude_keywords: rawExclude,
        location,
        max_pages: maxPages,
        sort_by: sortBy,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ config: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal menyimpan konfigurasi research.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
