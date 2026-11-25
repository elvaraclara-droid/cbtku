import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireRoleApi } from "@/lib/auth/session";
import { applyManualGradeScore } from "@/services/grading.service";

const manualGradeSchema = z.object({
  manualGradingId: z.string().uuid(),
  awardedScore: z.number().min(0),
  graderNote: z.string().max(1000).default(""),
  reason: z.string().max(500).default("Penilaian manual guru"),
});

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const parsed = manualGradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data nilai tidak valid" }, { status: 400 });
  }

  try {
    await applyManualGradeScore({
      manualGradingId: parsed.data.manualGradingId,
      awardedScore: parsed.data.awardedScore,
      graderNote: parsed.data.graderNote,
      reason: parsed.data.reason,
      actorId: auth.ctx.userId,
      actorRole: auth.ctx.profile.role,
      schoolId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
