import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

// Cookie-session client scoped to the requesting user. Use in Server
// Components, Server Actions, and Route Handlers that need to know who is
// signed in (respects RLS as that user).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component render — proxy.ts refreshes the
          // session cookie on the request/response cycle instead.
        }
      },
    },
  });
}
