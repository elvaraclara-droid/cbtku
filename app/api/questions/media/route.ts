import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { requireRoleApi } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const ALLOWED_MEDIA_RULES: Record<
  string,
  { bucket: string; mimes: string[]; exts: string[]; maxBytes: number }
> = {
  image: {
    bucket: "question-images",
    mimes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    exts: ["png", "jpg", "jpeg", "webp", "gif"],
    maxBytes: 5 * 1024 * 1024,
  },
  audio: {
    bucket: "question-audio",
    mimes: ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"],
    exts: ["mp3", "wav", "ogg", "webm"],
    maxBytes: 20 * 1024 * 1024,
  },
  video: {
    bucket: "question-videos",
    mimes: ["video/mp4", "video/webm"],
    exts: ["mp4", "webm"],
    maxBytes: 50 * 1024 * 1024,
  },
  attachment: {
    bucket: "exam-attachments",
    mimes: ["application/pdf", "image/png", "image/jpeg"],
    exts: ["pdf", "png", "jpg", "jpeg"],
    maxBytes: 10 * 1024 * 1024,
  },
};

export async function POST(request: NextRequest) {
  const auth = await requireRoleApi(["teacher", "school_admin", "super_admin"]);
  if (!auth.ok) return auth.response;

  const schoolId = auth.ctx.profile.school_id;
  if (!schoolId) {
    return NextResponse.json({ error: "school_id diperlukan" }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  const questionId = formData?.get("questionId") as string | null;
  const mediaType = (formData?.get("mediaType") as string | null) || "image";
  const caption = (formData?.get("caption") as string | null) || null;

  if (!file || !questionId) {
    return NextResponse.json({ error: "File dan questionId wajib diisi" }, { status: 400 });
  }

  const rule = ALLOWED_MEDIA_RULES[mediaType];
  if (!rule) {
    return NextResponse.json({ error: "Tipe media tidak didukung" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!rule.exts.includes(ext) || !rule.mimes.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipe atau ekstensi file tidak diizinkan (${file.type})` },
      { status: 400 }
    );
  }

  if (file.size <= 0 || file.size > rule.maxBytes) {
    return NextResponse.json(
      { error: `Ukuran file melebihi batas maksimal ${Math.round(rule.maxBytes / 1024 / 1024)} MB` },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const storagePath = `${schoolId}/${questionId}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await admin.storage
    .from(rule.bucket)
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: mediaRecord, error: dbErr } = await admin
    .from("question_media")
    .insert({
      school_id: schoolId,
      question_id: questionId,
      media_type: mediaType,
      bucket_name: rule.bucket,
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      caption,
      created_by: auth.ctx.userId,
    })
    .select("*")
    .single();

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 400 });
  }

  const { data: signed } = await admin.storage
    .from(rule.bucket)
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json(
    { media: mediaRecord, signedUrl: signed?.signedUrl || null },
    { status: 201 }
  );
}
