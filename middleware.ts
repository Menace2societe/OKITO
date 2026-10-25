import { NextResponse, type NextRequest } from "next/server"

// The other /api/... calls reach the PC's backend through the rewrite in
// next.config.js, which cannot add headers: add the access code here, as
// lib/backend-proxy.ts does for the proxy routes. Unset, requests pass as is.
export function middleware(request: NextRequest) {
  const code = process.env.CLIPFLOW_ACCESS_CODE
  if (!code) return NextResponse.next()
  const headers = new Headers(request.headers)
  headers.set("X-ClipFlow-Key", code)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: "/api/:path*",
}
