export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  appName: process.env.NEXT_PUBLIC_APP_NAME || "CBT SMART EXAM",
};

export function isSupabasePublicConfigured(): boolean {
  return Boolean(
    publicEnv.supabaseUrl &&
      publicEnv.supabaseAnonKey &&
      !publicEnv.supabaseUrl.includes("your-project-ref") &&
      !publicEnv.supabaseAnonKey.includes("your-supabase-anon-key")
  );
}

export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("SECURITY VIOLATION: getServerEnv() cannot run in the browser.");
  }
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    tokenHashPepper:
      process.env.TOKEN_HASH_PEPPER ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "dev-only-token-pepper-change-in-production",
    sessionSigningSecret:
      process.env.SESSION_SIGNING_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      "dev-only-session-secret-change-in-production",
    faceVerificationProvider:
      process.env.FACE_VERIFICATION_PROVIDER || "local_quality_plus_supervisor",
    faceVerificationApiUrl: process.env.FACE_VERIFICATION_API_URL || "",
    faceVerificationApiKey: process.env.FACE_VERIFICATION_API_KEY || "",
  };
}

export function isSupabaseAdminConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(
    isSupabasePublicConfigured() &&
      env.serviceRoleKey &&
      !env.serviceRoleKey.includes("your-supabase-service-role-key")
  );
}
