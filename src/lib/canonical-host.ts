/**
 * Canonical-domain redirect decision: the app is reachable at both the
 * apex (relaxanator.com) and the www subdomain, so we pick the apex as the one
 * canonical origin and permanently redirect www → apex. This module is the pure
 * host → redirect-target decision; the Next.js edge wiring lives in
 * src/proxy.ts and imports `canonicalRedirectTarget` from here so the
 * branching logic stays deterministic and unit-tested.
 */

/** The single canonical origin. All other production hosts fold into this one. */
export const CANONICAL_HOST = "relaxanator.com";

/** The www alias that must permanently redirect to the apex. */
export const WWW_HOST = "www.relaxanator.com";

/**
 * Permanent, method-preserving redirect. 308 keeps the request method/body
 * (unlike 301, which historically let clients downgrade POST → GET) and is
 * cached by browsers, so search engines and clients settle on the apex.
 */
export const CANONICAL_REDIRECT_STATUS = 308;

/**
 * Normalize a Host header value for comparison: drop any `:port` suffix and
 * lowercase. Returns "" for nullish/empty input so callers can bail cleanly.
 */
export function normalizeHost(host: string | null | undefined): string {
  if (!host) return "";
  // Host may carry a port (e.g. "www.relaxanator.com:443"); the redirect
  // decision only cares about the hostname.
  const withoutPort = host.split(":", 1)[0];
  return withoutPort.trim().toLowerCase();
}

/**
 * Given the incoming host and the original path (already including any query
 * string, e.g. "/breathe?voice=alto"), decide whether to redirect to the
 * canonical apex origin.
 *
 * Only the exact www alias is redirected. localhost, *.fly.dev, Fly preview
 * hosts, the apex itself, and any other host resolve to `null` (no redirect),
 * so dev, preview, and health checks are untouched. The path and query are
 * carried over verbatim onto https://relaxanator.com.
 *
 * @returns the absolute https URL to redirect to, or `null` to pass through.
 */
export function canonicalRedirectTarget(
  host: string | null | undefined,
  pathWithQuery: string,
): string | null {
  if (normalizeHost(host) !== WWW_HOST) return null;
  // Guard against a missing/relative path; always anchor at "/".
  const suffix = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `https://${CANONICAL_HOST}${suffix}`;
}
