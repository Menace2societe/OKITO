export const maxDuration = 300
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const BACKEND_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000"

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const upstream = await fetch(`${BACKEND_URL}/api/transcribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body,
      cache: "no-store",
    })

    const contentType = upstream.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) {
      const rawText = await upstream.text()
      console.error("[ClipFlow] Réponse upstream non-JSON /api/transcribe :", rawText)
      return Response.json(
        {
          detail:
            "Le backend de transcription a renvoyé une réponse non-JSON.",
          raw: rawText.slice(0, 1000),
        },
        { status: upstream.status || 502 }
      )
    }

    const data = await upstream.json()
    return Response.json(data, {
      status: upstream.status,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[ClipFlow] Erreur proxy /api/transcribe :", error)
    return Response.json(
      {
        detail:
          error instanceof Error
            ? `Erreur proxy transcription: ${error.message}`
            : "Erreur proxy transcription inconnue.",
      },
      { status: 502 }
    )
  }
}
