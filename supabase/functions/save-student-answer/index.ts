// Supabase Edge Function: save-student-answer
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

    const body = await req.json();
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: student } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", user.id)
      .single();

    const { data: attempt } = await admin
      .from("exam_attempts")
      .select("id, school_id, exam_id, session_id, student_id, status, deadline_at")
      .eq("id", body.attempt_id)
      .eq("student_id", student.id)
      .single();

    if (!attempt || ["SUBMITTED", "TERMINATED", "PAUSED", "LOCKED", "PENDING_SUPERVISOR_APPROVAL"].includes(attempt.status)) {
      return new Response(JSON.stringify({ error: "Attempt tidak aktif untuk penyimpanan jawaban" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: saved, error } = await admin.rpc("save_student_answer_atomic", {
      p_school_id: attempt.school_id,
      p_exam_id: attempt.exam_id,
      p_session_id: attempt.session_id,
      p_student_id: attempt.student_id,
      p_attempt_id: attempt.id,
      p_question_id: body.question_id,
      p_selected_option_id: body.selected_option_id ?? null,
      p_selected_option_ids: body.selected_option_ids ?? [],
      p_statement_answers: body.statement_answers ?? {},
      p_essay_answer: body.essay_answer ?? null,
      p_is_flagged: Boolean(body.is_flagged),
      p_is_answered: Boolean(body.is_answered),
      p_answer_version: Number(body.answer_version || 1),
      p_idempotency_key: String(body.idempotency_key),
      p_client_updated_at: body.client_updated_at || new Date().toISOString(),
      p_actor_id: user.id,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: saved?.[0] }), {
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
