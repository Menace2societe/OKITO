// Which ClipFlow backend the browser talks to.
//
// Local mode (no NEXT_PUBLIC_*_API_URL set, the default): every call stays a
// relative /api/... URL, proxied by Next.js to the backend on this PC, as before.
//
// Online mode: the browser calls the backends directly, with the access code
// in the X-ClipFlow-Key header. Each project sticks to one backend:
// an imported file goes to the cloud, a YouTube link to the PC (only the PC's
// home connection gets past YouTube's bot checks).

export type BackendRole = "cloud" | "pc"

const BACKENDS: Record<BackendRole, string> = {
  cloud: (process.env.NEXT_PUBLIC_CLOUD_API_URL || "").replace(/\/+$/, ""),
  pc: (process.env.NEXT_PUBLIC_PC_API_URL || "").replace(/\/+$/, ""),
}

export const ONLINE = Boolean(BACKENDS.cloud || BACKENDS.pc)

const ACCESS_CODE_KEY = "clipflow:access-code"

let accessCode = ""
let activeBase = ""

export function backendUrl(role: BackendRole): string {
  // A missing backend falls back to the other one.
  return BACKENDS[role] || BACKENDS[role === "cloud" ? "pc" : "cloud"]
}

// Sends the next project's calls to `role`'s backend. No-op in local mode.
export function selectBackend(role: BackendRole): void {
  if (ONLINE) activeBase = backendUrl(role)
}

export function getAccessCode(): string {
  if (!accessCode) {
    try {
      accessCode = localStorage.getItem(ACCESS_CODE_KEY) || ""
    } catch {
      // Storage unavailable: the code is asked again on each visit.
    }
  }
  return accessCode
}

export function setAccessCode(code: string): void {
  accessCode = code
  try {
    if (code) localStorage.setItem(ACCESS_CODE_KEY, code)
    else localStorage.removeItem(ACCESS_CODE_KEY)
  } catch {
    // Storage unavailable: the code lives until the tab closes.
  }
}

function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init)
  const code = ONLINE ? getAccessCode() : ""
  if (code) headers.set("X-ClipFlow-Key", code)
  return headers
}

// fetch() for an API path such as "/api/upload", on the project's backend.
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${activeBase}${path}`, { ...init, headers: authHeaders(init.headers) })
}

// POSTs `body` like apiFetch, reporting the upload progress (0–1): fetch()
// can't, and a video takes minutes to reach the online backend.
export function apiUpload(
  path: string,
  body: FormData,
  onProgress: (fraction: number) => void,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${activeBase}${path}`)
    authHeaders().forEach((value, name) => xhr.setRequestHeader(name, value))
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      resolve(new Response(xhr.responseText, {
        status: xhr.status,
        headers: { "Content-Type": xhr.getResponseHeader("Content-Type") || "text/plain" },
      }))
    xhr.onerror = () => reject(new Error("Connexion au serveur perdue pendant l'envoi."))
    xhr.send(body)
  })
}

// Media URLs come back from the backend as "/api/files/...": make them
// point at the backend that produced them.
export function mediaUrl(url: string | null | undefined): string | null {
  if (!url) return null
  return /^https?:\/\//.test(url) ? url : `${activeBase}${url}`
}

// A cross-origin <a download> is ignored by browsers: online, ask the
// backend to send the file as an attachment instead.
export function downloadUrl(url: string | null | undefined): string | null {
  const absolute = mediaUrl(url)
  if (!absolute || !ONLINE) return absolute
  return `${absolute}${absolute.includes("?") ? "&" : "?"}download=1`
}

export interface BackendHealth {
  status: string
  role: BackendRole
  auth_required: boolean
  authorized: boolean
}

// null when the backend can't be reached (PC off, Space asleep or waking up).
export function hasBackend(role: BackendRole): boolean {
  return Boolean(BACKENDS[role])
}

export async function checkHealth(role: BackendRole, code = getAccessCode()): Promise<BackendHealth | null> {
  const base = BACKENDS[role]
  if (!base) return null
  try {
    const headers = new Headers()
    if (code) headers.set("X-ClipFlow-Key", code)
    const res = await fetch(`${base}/api/health`, { headers, cache: "no-store" })
    if (!res.ok) return null
    return (await res.json()) as BackendHealth
  } catch {
    return null
  }
}
