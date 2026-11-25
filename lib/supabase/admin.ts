import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv, isSupabaseAdminConfigured } from "@/lib/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabaseClient = SupabaseClient<any, "public", any>;

let adminClient: UntypedSupabaseClient | null = null;

/**
 * Privileged Supabase client using Service Role Key.
 * STRICTLY SERVER-ONLY. Never import in Client Components.
 */
export function createSupabaseAdminClient(): UntypedSupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY atau NEXT_PUBLIC_SUPABASE_URL belum dikonfigurasi di server."
    );
  }

  if (!adminClient) {
    const env = getServerEnv();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    adminClient = createClient<any>(env.supabaseUrl, env.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
