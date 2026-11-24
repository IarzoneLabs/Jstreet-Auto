import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  computeAuthToken,
  timingSafeEqualStr,
} from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const configuredPassword = process.env.DASHBOARD_PASSWORD?.trim();
  if (!configuredPassword) {
    // Jika belum diset di env, lewati agar tidak memblokir dev lokal tanpa konfigurasi
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  if (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const cookieVal = req.cookies.get(AUTH_COOKIE_NAME)?.value || "";
  const expectedToken = await computeAuthToken(configuredPassword);
  const isAuthed = cookieVal.length > 0 && timingSafeEqualStr(cookieVal, expectedToken);

  if (isAuthed) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Unauthorized. Silakan login terlebih dahulu." },
      { status: 401 }
    );
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
