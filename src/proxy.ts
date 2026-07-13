import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { CANONICAL_REDIRECT_STATUS, canonicalRedirectTarget } from "@/lib/canonical-host";

/**
 * Canonical-domain redirect: permanently fold www.relaxanator.com into
 * the apex relaxanator.com. All decision logic lives in the pure, unit-tested
 * `canonicalRedirectTarget`; this proxy just supplies the request host +
 * original path/query and issues the 308 when it returns a target. localhost,
 * *.fly.dev, and the apex resolve to `null`, so dev/preview are untouched.
 */
export function proxy(request: NextRequest): NextResponse {
  const host = request.headers.get("host");
  const { pathname, search } = request.nextUrl;
  const target = canonicalRedirectTarget(host, `${pathname}${search}`);

  if (target) {
    return NextResponse.redirect(target, CANONICAL_REDIRECT_STATUS);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every request except Next internals and static assets — the host
  // check is cheap and we want the redirect to cover any deep link. Excluding
  // _next/*, favicon, and the Serwist SW route keeps build/runtime assets
  // (and service-worker registration) on their own origin.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|serwist/).*)"],
};
