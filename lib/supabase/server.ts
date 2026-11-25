import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicEnv, isSupabasePublicConfigured } from "@/lib/env";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createSupabaseServerClient(): Promise<SupabaseClient<any, "public", any>> {
  if (!isSupabasePublicConfigured()) {
    throw new Error(
      "Supabase belum dikonfigurasi pada environment server (.env.local)."
    );
  }

  const cookieStore = await cookies();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component where setting cookies is ignored;
          // middleware or route handlers handle session cookie refresh.
        }
      },
    },
  });
}
