import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  computeAuthToken,
  timingSafeEqualStr,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const configuredPassword = process.env.DASHBOARD_PASSWORD?.trim();
    if (!configuredPassword) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD belum dikonfigurasi di server." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const submitted = String(body?.password || "").trim();

    if (!submitted || !timingSafeEqualStr(submitted, configuredPassword)) {
      return NextResponse.json(
        { error: "PIN / Password salah. Silakan coba lagi." },
        { status: 401 }
      );
    }

    const token = await computeAuthToken(configuredPassword);
    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 hari
    });
    return res;
  } catch {
    return NextResponse.json({ error: "Permintaan login tidak valid." }, { status: 400 });
  }
}
