import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extractCvText, extractSkillsFromText } from "@/lib/cv-extract";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin();
    const contentType = req.headers.get("content-type") || "";

    let filename = "cv.pdf";
    let buffer: Buffer;
    let storagePath: string;

    if (contentType.includes("application/json")) {
      // Jalur file besar (> 4 MB): file sudah diunggah langsung ke Supabase Storage via signed URL
      const body = await req.json();
      filename = String(body?.filename || "cv.pdf");
      storagePath = String(body?.storagePath || "");
      if (!storagePath) {
        return NextResponse.json(
          { error: "storagePath wajib diisi." },
          { status: 400 }
        );
      }

      const { data: downloaded, error: dlErr } = await sb.storage
        .from("cvs")
        .download(storagePath);

      if (dlErr || !downloaded) {
        throw dlErr || new Error("Gagal membaca file CV dari Supabase Storage.");
      }
      buffer = Buffer.from(await downloaded.arrayBuffer());
    } else {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "File CV (PDF / DOCX / TXT) wajib diunggah." },
          { status: 400 }
        );
      }

      filename = file.name || "cv.pdf";
      const allowedExt = [".pdf", ".docx", ".txt"];
      if (!allowedExt.some((ext) => filename.toLowerCase().endsWith(ext))) {
        return NextResponse.json(
          { error: "Format file tidak didukung. Gunakan PDF, DOCX, atau TXT." },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);

      const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      storagePath = `uploads/${Date.now()}_${safeName}`;
      await sb.storage.from("cvs").upload(storagePath, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    }

    const rawText = await extractCvText(filename, buffer);

    if (!rawText || rawText.length < 30) {
      return NextResponse.json(
        {
          error:
            "Teks CV tidak berhasil diekstrak (mungkin PDF berupa gambar scan). Gunakan PDF berbasis teks atau DOCX.",
        },
        { status: 400 }
      );
    }

    const skills = extractSkillsFromText(rawText);

    // Nonaktifkan CV lama terlebih dahulu (karena partial unique index single active)
    await sb.from("cv_profiles").update({ is_active: false }).eq("is_active", true);

    const summaryPreview = rawText.slice(0, 280).replace(/\s+/g, " ") + "...";
    const { data, error } = await sb
      .from("cv_profiles")
      .insert({
        filename,
        storage_path: storagePath,
        raw_text: rawText,
        summary: summaryPreview,
        extracted_skills: skills,
        is_active: true,
      })
      .select(
        "id, filename, storage_path, summary, extracted_skills, preferred_roles, years_experience, is_active, created_at"
      )
      .single();

    if (error) throw error;

    return NextResponse.json({ cv: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mengunggah CV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const cvId = typeof body?.cvId === "string" ? body.cvId : "";
    if (!cvId) {
      return NextResponse.json({ error: "cvId wajib diisi." }, { status: 400 });
    }

    const sb = getSupabaseAdmin();
    await sb.from("cv_profiles").update({ is_active: false }).eq("is_active", true);
    const { data, error } = await sb
      .from("cv_profiles")
      .update({ is_active: true })
      .eq("id", cvId)
      .select(
        "id, filename, storage_path, summary, extracted_skills, preferred_roles, years_experience, is_active, created_at"
      )
      .single();

    if (error) throw error;
    return NextResponse.json({ cv: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal mengganti CV aktif.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
