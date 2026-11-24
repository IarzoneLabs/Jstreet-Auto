import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const VALID_STATUSES = new Set(["new", "saved", "applied", "dismissed"]);

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const matchId = typeof body?.matchId === "string" ? body.matchId.trim() : "";
    const userStatus =
      typeof body?.user_status === "string" ? body.user_status.trim() : "";

    if (!matchId || !VALID_STATUSES.has(userStatus)) {
      return NextResponse.json(
        { error: "matchId dan user_status (new/saved/applied/dismissed) wajib valid." },
        { status: 400 }
      );
    }

    const sb = getSupabaseAdmin();
    const updates: Record<string, unknown> = {
      user_status: userStatus,
      updated_at: new Date().toISOString(),
    };
    if (typeof body?.user_notes === "string") {
      updates.user_notes = body.user_notes.trim().slice(0, 500) || null;
    }

    const { data, error } = await sb
      .from("job_matches")
      .update(updates)
      .eq("id", matchId)
      .select("id, user_status, user_notes")
      .single();

    if (error) throw error;
    return NextResponse.json({ match: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal memperbarui status lowongan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
