// Supabase Edge Function: validate-exam-token
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const pepper = Deno.env.get("TOKEN_HASH_PEPPER") || serviceKey;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { token } = await req.json();
    const normalized = String(token || "").trim().toUpperCase().replace(/[\s-]+/g, "");
    if (normalized.length < 6 || normalized.length > 16) {
      return new Response(JSON.stringify({ error: "Format token tidak valid" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const tokenHash = await hmacSha256Hex(pepper, `cbt-token:${normalized}`);

    const { data: tokenRow } = await admin
      .from("exam_tokens")
      .select("id, exam_id, session_id, status, valid_from, valid_until, usage_policy, max_uses, use_count")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const now = new Date();
    if (
      !tokenRow ||
      tokenRow.status !== "active" ||
      now < new Date(tokenRow.valid_from) ||
      now > new Date(tokenRow.valid_until)
    ) {
      return new Response(JSON.stringify({ valid: false, error: "Token tidak aktif atau kedaluwarsa" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: student } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!student) {
      return new Response(JSON.stringify({ valid: false, error: "Profil siswa tidak ditemukan" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: enrolled } = await admin
      .from("exam_session_students")
      .select("id, status")
      .eq("exam_id", tokenRow.exam_id)
      .eq("session_id", tokenRow.session_id)
      .eq("student_id", student.id)
      .maybeSingle();

    if (!enrolled || enrolled.status !== "enrolled") {
      return new Response(JSON.stringify({ valid: false, error: "Siswa tidak terdaftar pada sesi token ini" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        exam_id: tokenRow.exam_id,
        session_id: tokenRow.session_id,
        token_id: tokenRow.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
