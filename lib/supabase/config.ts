// Supabase connection config.
// The anon key is a public, client-safe key (protected by Row Level Security),
// so embedding it as a fallback is safe and guarantees the browser client always
// has a valid URL/key regardless of build-time env inlining behavior.
// Env vars still take precedence when present.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cpuusycvabrfucvpffoz.supabase.co";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwdXVzeWN2YWJyZnVjdnBmZm96Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MzAzNzIsImV4cCI6MjA5NzEwNjM3Mn0.E7FiUQ1eQG-FcBjUEawNO5NqWd7RgqOVyU3hTHDHos0";
