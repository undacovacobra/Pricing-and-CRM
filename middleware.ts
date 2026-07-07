import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./lib/supabase/config";
import { roleFromUser, pathAllowedForRole, INSTALLER_HOME } from "./lib/auth/roles";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/login");
  // The offline workspace renders entirely from on-device data; allow it
  // through so a prefetch caches the real page, not a login redirect.
  const isPublic = isAuthPage || request.nextUrl.pathname.startsWith("/offline");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  const role = user ? roleFromUser(user) : null;

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = role === "installer" ? INSTALLER_HOME : "/";
    return NextResponse.redirect(url);
  }

  // Installers may only open the calendar / tasks areas; send them home otherwise.
  if (user && role === "installer" && !isPublic && !pathAllowedForRole(request.nextUrl.pathname, role)) {
    const url = request.nextUrl.clone();
    url.pathname = INSTALLER_HOME;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Exclude API, Next internals, images, and the PWA files (manifest + service
    // worker) — those must be publicly fetchable so the browser can install the
    // app and pick up manifest shortcuts without an auth redirect.
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
