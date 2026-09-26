import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "cortes_session";

// UX-only gate: the real check is the API validating the session cookie on
// every request. Without a cookie there is no point rendering the app shell
// just to have every fetch bounce back to /login.
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // /login is always reachable: a stale cookie (expired or revoked) still
  // "exists", and bouncing it back into the app caused a reload loop.
  if (pathname === "/login") {
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)",
  ],
};
