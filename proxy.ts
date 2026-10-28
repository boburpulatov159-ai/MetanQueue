import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const needsLogin = ["/profile", "/ticket", "/owner", "/admin", "/mfa"];
// Staff areas also require a second factor (TOTP). The database re-checks this for admin actions.
const needsMfa = ["/owner", "/admin"];
const under = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list, headers) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
        },
      },
    },
  );

  // getClaims validates the JWT signature; never trust getSession() on the server.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const path = request.nextUrl.pathname;

  const redirect = (to: string) => {
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = `?next=${encodeURIComponent(path)}`;
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (!claims && under(path, needsLogin)) return redirect("/login");
  if (claims && under(path, needsMfa) && claims.aal !== "aal2") return redirect("/mfa");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
