import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const filename = String(body?.filename || "cv.pdf");
    const allowedExt = [".pdf", ".docx", ".txt"];

    if (!allowedExt.some((ext) => filename.toLowerCase().endsWith(ext))) {
      return NextResponse.json(
        { error: "Format file tidak didukung. Gunakan PDF, DOCX, atau TXT." },
        { status: 400 }
      );
    }

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `uploads/${Date.now()}_${safeName}`;
    const sb = getSupabaseAdmin();

    const { data, error } = await sb.storage
      .from("cvs")
      .createSignedUploadUrl(storagePath);

    if (error || !data?.signedUrl) {
      throw error || new Error("Gagal membuat URL upload Supabase.");
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      storagePath,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Gagal menyiapkan upload CV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
