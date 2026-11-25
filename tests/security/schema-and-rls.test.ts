import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REQUIRED_TABLES = [
  "profiles",
  "schools",
  "school_settings",
  "academic_years",
  "semesters",
  "classes",
  "students",
  "teachers",
  "subjects",
  "teacher_subjects",
  "question_banks",
  "questions",
  "question_options",
  "question_statements",
  "question_media",
  "question_categories",
  "exams",
  "exam_questions",
  "exam_sessions",
  "exam_session_students",
  "exam_supervisors",
  "exam_tokens",
  "exam_attempts",
  "student_answers",
  "answer_details",
  "exam_activity_logs",
  "exam_security_events",
  "supervisor_actions",
  "supervisor_override_logs",
  "exam_announcements",
  "user_sessions",
  "face_verification_records",
  "exam_results",
  "manual_grading",
  "grading_history",
  "report_exports",
  "audit_logs",
  "system_settings",
  "notifications",
];

describe("Supabase Migration Schema & RLS Completeness", () => {
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
  const sqlFiles = fs.readdirSync(migrationsDir).sort();
  const combinedSql = sqlFiles
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n");

  it("creates every required table in migrations", () => {
    for (const table of REQUIRED_TABLES) {
      const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`, "i");
      expect(combinedSql, `Missing CREATE TABLE for ${table}`).toMatch(pattern);
    }
  });

  it("enables Row Level Security on every required table", () => {
    for (const table of REQUIRED_TABLES) {
      const rlsPattern = new RegExp(
        `ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`,
        "i"
      );
      expect(combinedSql, `Missing ENABLE ROW LEVEL SECURITY for ${table}`).toMatch(rlsPattern);
    }
  });

  it("does not grant student or supervisor SELECT policies on answer key tables", () => {
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, "0006_rls_helpers_and_policies.sql"),
      "utf8"
    );
    const optPolicyMatch = rlsSql.match(
      /CREATE POLICY question_options_staff_only[\s\S]*?;/i
    );
    const stmtPolicyMatch = rlsSql.match(
      /CREATE POLICY question_statements_staff_only[\s\S]*?;/i
    );
    expect(optPolicyMatch?.[0]).toBeTruthy();
    expect(optPolicyMatch?.[0]).not.toContain("'student'");
    expect(optPolicyMatch?.[0]).not.toContain("'supervisor'");
    expect(stmtPolicyMatch?.[0]).toBeTruthy();
    expect(stmtPolicyMatch?.[0]).not.toContain("'student'");
    expect(stmtPolicyMatch?.[0]).not.toContain("'supervisor'");
  });
});
