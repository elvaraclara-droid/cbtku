import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { authenticateStudentWithExamToken } from "@/services/student-auth.service";

const studentLoginSchema = z.object({
  username: z.string().min(2).max(64),
  password: z.string().min(4).max(128),
  token: z.string().min(6).max(24),
});

export async function POST(request: NextRequest) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      {
        error:
          "Supabase belum terhubung. Lengkapi konfigurasi environment variables (.env.local) terlebih dahulu.",
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = studentLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Username, Password, dan Token Ujian wajib diisi." },
      { status: 400 }
    );
  }

  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = request.headers.get("user-agent") || null;

  const result = await authenticateStudentWithExamToken({
    username: parsed.data.username,
    password: parsed.data.password,
    token: parsed.data.token,
    ipAddress,
    userAgent,
  });

  if (!result.ok || !result.data) {
    return NextResponse.json(
      { error: result.error || "Login siswa gagal." },
      { status: result.statusCode }
    );
  }

  const response = NextResponse.json({
    ok: true,
    ...result.data,
    redirectTo: result.data.mustChangePassword
      ? "/student/change-password"
      : `/student/check-in?examId=${result.data.examId}&sessionId=${result.data.sessionId}`,
  });

  // Store HTTP-only active session marker for multi-session checks
  response.cookies.set("cbt_session_token_id", result.data.sessionTokenId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}
