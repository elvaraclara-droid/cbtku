import { NextResponse } from "next/server";
import { isSupabaseAdminConfigured, isSupabasePublicConfigured } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const publicReady = isSupabasePublicConfigured();
  const adminReady = isSupabaseAdminConfigured();

  let dbConnected = false;
  let dbError: string | null = null;

  if (publicReady && adminReady) {
    try {
      const admin = createSupabaseAdminClient();
      const { error } = await admin
        .from("system_settings")
        .select("key", { head: true, count: "exact" });
      if (error) {
        dbError = error.message;
      } else {
        dbConnected = true;
      }
    } catch (err) {
      dbError = (err as Error).message;
    }
  }

  return NextResponse.json({
    app: "CBT SMART EXAM",
    tagline: "SMART EXAMINATION, SECURE ASSESSMENT.",
    serverTime: new Date().toISOString(),
    supabase: {
      publicConfigured: publicReady,
      adminConfigured: adminReady,
      dbConnected,
      dbError,
    },
  });
}
