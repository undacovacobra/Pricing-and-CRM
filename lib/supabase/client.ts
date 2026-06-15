import { createBrowserClient } from "@supabase/ssr";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any;

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
