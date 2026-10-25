// Server side only: headers for the Next.js routes that proxy to the PC's
// backend. Once the PC is reachable from the internet (Tailscale Funnel), its
// backend requires the access code; the local frontend holds it in
// CLIPFLOW_ACCESS_CODE (.env.local) and adds it here, so the browser never
// needs it. Unset, nothing is added, as before.
export function backendHeaders(headers: Record<string, string>): Record<string, string> {
  const code = process.env.CLIPFLOW_ACCESS_CODE
  return code ? { ...headers, "X-ClipFlow-Key": code } : headers
}
