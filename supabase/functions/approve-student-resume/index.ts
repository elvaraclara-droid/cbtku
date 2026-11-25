// Supabase Edge Function: approve-student-resume
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "../_shared/cors.ts";

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

    const { attempt_id, reason } = await req.json();
    if (!reason || String(reason).trim().length < 3) {
      return new Response(JSON.stringify({ error: "Alasan wajib diisi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, school_id")
      .eq("id", user.id)
      .single();

    if (!profile || !["supervisor", "school_admin", "super_admin"].includes(profile.role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: attempt } = await admin
      .from("exam_attempts")
      .select("*")
      .eq("id", attempt_id)
      .single();

    if (!attempt) {
      return new Response(JSON.stringify({ error: "Attempt tidak ditemukan" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (profile.role === "supervisor") {
      const { data: assignment } = await admin
        .from("exam_supervisors")
        .select("can_approve_resume")
        .eq("exam_id", attempt.exam_id)
        .eq("supervisor_id", user.id)
        .eq("status", "assigned")
        .maybeSingle();

      if (!assignment?.can_approve_resume) {
        return new Response(JSON.stringify({ error: "Tidak ditugaskan untuk izin lanjutkan" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: updated } = await admin
      .from("exam_attempts")
      .update({
        status: "RESUMED",
        paused_at: null,
        server_timestamp: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", attempt.id)
      .select("*")
      .single();

    await admin.from("supervisor_actions").insert({
      school_id: attempt.school_id,
      exam_id: attempt.exam_id,
      session_id: attempt.session_id,
      attempt_id: attempt.id,
      student_id: attempt.student_id,
      supervisor_id: user.id,
      action_type: "RESUME_APPROVED",
      status_before: attempt.status,
      status_after: "RESUMED",
      reason: String(reason).trim(),
    });

    return new Response(JSON.stringify({ ok: true, attempt: updated }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
