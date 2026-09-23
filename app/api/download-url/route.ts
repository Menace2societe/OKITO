import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 300
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function sanitizeYoutubeUrl(url: string): string {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*?v=|embed\/|shorts\/)|youtu\.be\/|v=|\/)([0-9A-Za-z_-]{11})(?=[^0-9A-Za-z_-]|$)/i
  )
  if (match) {
    return `https://www.youtube.com/watch?v=${match[1]}`
  }
  return url
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Prefer 127.0.0.1 over localhost to avoid IPv6 resolution issues on Windows.
    const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000"
    const cleanUrl = sanitizeYoutubeUrl(body.url || "")

    let response: Response
    try {
      response = await fetch(`${FASTAPI_URL}/api/download-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, url: cleanUrl }),
        cache: "no-store",
      })
    } catch (fetchErr) {
      console.error("[Download-URL] Impossible de joindre FastAPI :", fetchErr)
      return NextResponse.json(
        {
          detail: `Le serveur backend (FastAPI) est injoignable sur ${FASTAPI_URL}. Assurez-vous qu'Uvicorn tourne.`,
        },
        { status: 503 }
      )
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      const rawText = await response.text()
      console.error("[Download-URL] Réponse non-JSON de FastAPI :", rawText)
      return NextResponse.json(
        { detail: "Le serveur backend a renvoyé une réponse invalide." },
        { status: 500 }
      )
    }

    const data = await response.json()
    return NextResponse.json(data, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[Download-URL] Exception globale :", error)
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Erreur interne de traitement.",
      },
      { status: 500 }
    )
  }
}
