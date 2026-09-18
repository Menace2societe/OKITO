import { NextRequest, NextResponse } from "next/server"

export const maxDuration = 300
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const response = await fetch(`${FASTAPI_URL}/api/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      const rawText = await response.text()
      console.error("[ClipFlow Export] Erreur non-JSON FastAPI :", rawText)
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
    console.error("[ClipFlow Export] Exception :", error)
    return NextResponse.json(
      {
        detail:
          error instanceof Error
            ? error.message
            : "Erreur de connexion au serveur backend.",
      },
      { status: 500 }
    )
  }
}
