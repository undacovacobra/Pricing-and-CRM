import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
// Database type is defined in @/lib/types/database — once connected to Supabase,
// run `supabase gen types typescript` to replace this with auto-generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — can't set cookies during render
          }
        },
      },
    }
  );
}
