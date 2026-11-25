import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, isSupabasePublicConfigured } from "@/lib/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserClient: SupabaseClient<any, "public", any> | null = null;

export function createSupabaseBrowserClient() {
  if (!isSupabasePublicConfigured()) {
    throw new Error(
      "Supabase belum dikonfigurasi. Lengkapi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local."
    );
  }
  if (!browserClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    browserClient = createBrowserClient<any>(
      publicEnv.supabaseUrl,
      publicEnv.supabaseAnonKey
    );
  }
  return browserClient;
}
