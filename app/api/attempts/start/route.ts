import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { startOrResumeExamAttempt } from "@/services/exam-attempt.service";

const startSchema = z.object({
  examId: z.string().uuid(),
  sessionId: z.string().uuid(),
  tokenId: z.string().uuid().optional().nullable(),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["student"]);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "examId dan sessionId tidak valid" }, { status: 400 });
  }

  try {
    const sessionTokenId = request.cookies.get("cbt_session_token_id")?.value || null;
    const result = await startOrResumeExamAttempt({
      studentProfileId: auth.ctx.userId,
      examId: parsed.data.examId,
      sessionId: parsed.data.sessionId,
      tokenId: parsed.data.tokenId,
      sessionTokenId,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
