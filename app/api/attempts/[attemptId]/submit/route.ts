import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth/session";
import { submitStudentAttempt } from "@/services/exam-attempt.service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> }
) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const { attemptId } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const result = await submitStudentAttempt({
      attemptId,
      studentProfileId: auth.ctx.userId,
      reason: body?.reason,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
