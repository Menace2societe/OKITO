"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { TIRAGE_FRAME } from "@/components/tirage"
import { usePcStatus } from "@/components/use-pc-status"
import { apiFetch, apiUpload, mediaUrl, selectBackend } from "@/lib/backend"

interface ImportStepProps {
  onFileImported: (
    fileId: string,
    fileName: string,
    fileUrl: string,
    duration: number,
    videoPath: string
  ) => void;
}

function formatMb(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1).replace(".", ",")
}

export function ImportStep({ onFileImported }: ImportStepProps) {
  const [dragActive, setDragActive] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  // Online, YouTube links are downloaded by the PC: it must be on.
  const pcStatus = usePcStatus()
  const linksAvailable = pcStatus === "local" || pcStatus === "online"

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0])
    }
  }

  const [error, setError] = React.useState<string | null>(null)
  // File being sent and the share already sent (0–1); null when idle.
  const [upload, setUpload] = React.useState<{ name: string; size: number; sent: number } | null>(null)

  const processFile = async (file: File) => {
    setLoading(true)
    setError(null)
    setUpload({ name: file.name, size: file.size, sent: 0 })
    try {
      const formData = new FormData()
      formData.append("file", file)
      selectBackend("cloud")
      const res = await apiUpload("/api/upload", formData, (sent) =>
        setUpload({ name: file.name, size: file.size, sent }),
      )

      if (!res.ok) {
        // Try to parse JSON error, fall back to status text if body isn't JSON
        let message = `Le serveur a refusé l'envoi (erreur ${res.status}). Vérifie que le fichier est une vidéo ou un son, puis réessaie`
        try {
          const err = await res.json()
          message = err.detail || message
        } catch {
          // Response body wasn't JSON (e.g. HTML error page) — use fallback
        }
        throw new Error(message)
      }

      const data = await res.json()
      onFileImported(data.file_id, data.original_name, mediaUrl(data.preview_url) ?? "", data.duration, data.video_path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "L'envoi s'est interrompu. Vérifie la connexion, puis renvoie le fichier")
    } finally {
      setLoading(false)
      setUpload(null)
    }
  }

  const handleUrlSubmit = async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      selectBackend("pc")
      const res = await apiFetch("/api/download-url", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const rawText = await res.text()
        console.error("[ClipFlow Import] Réponse brute non-JSON :", rawText)
        throw new Error("Le serveur a renvoyé une réponse illisible pendant l'import. Attends une minute, puis réessaie.")
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Le PC relais n'a pas pu récupérer cette vidéo. Vérifie le lien.")
      }

      onFileImported(data.file_id, data.title, mediaUrl(data.preview_url) ?? "", data.duration, data.video_path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "La récupération de la vidéo s'est interrompue. Vérifie que le PC relais est allumé, puis réessaie")
    } finally {
      setLoading(false)
    }
  }

  const pcLine =
    pcStatus === "online"
      ? "PC relais allumé : les liens YouTube passent."
      : pcStatus === "checking"
        ? "Vérification du PC relais…"
        : "PC relais éteint : les liens YouTube ne passent pas. Importe le fichier à la place."

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div aria-hidden className="hidden lg:block lg:self-start">
        <div className={TIRAGE_FRAME}>
          <div className="flex h-[480px] w-[270px] items-center justify-center border border-dashed border-filet-fort bg-fond px-8 text-center text-base text-gris">
            Ta vidéo apparaîtra ici
          </div>
          <div className="min-h-[76px]" />
        </div>
      </div>

      <div className="min-w-0 max-w-3xl space-y-10">
      <section aria-labelledby="import-titre" className="space-y-6">
        <h1 id="import-titre" className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
          Importe ta vidéo
        </h1>

        <div
          className={cn(
            "border bg-papier px-5 py-10 transition-colors sm:px-10 sm:py-14",
            dragActive ? "border-dashed border-encre" : "border-filet hover:border-dashed hover:border-filet-fort"
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mkv,.mov,.mp3"
            className="hidden"
            onChange={handleChange}
          />
          <div className="flex flex-col items-start gap-5">
            <div className="space-y-2">
              <p className="text-2xl font-bold [font-stretch:92%]">
                {dragActive ? "Lâche la vidéo ici" : "Glisse ta vidéo ici"}
              </p>
              <p className="chiffres text-[15px] text-gris">Formats acceptés : .mp4, .mkv, .mov, .mp3</p>
            </div>
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={loading}>
              {loading && upload && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              Choisir un fichier
            </Button>

            {upload && (
              <div aria-live="polite" className="w-full space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[15px]">
                  <span className="min-w-0 max-w-full truncate text-encre">{upload.name}</span>
                  <span className="chiffres shrink-0 font-semibold text-encre">
                    {upload.sent < 1
                      ? `${formatMb(upload.size * upload.sent)} / ${formatMb(upload.size)} Mo · ${Math.floor(upload.sent * 100)} %`
                      : "Préparation de la vidéo…"}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Envoi de la vidéo"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.floor(upload.sent * 100)}
                  className="h-1.5 bg-filet"
                >
                  <div
                    className="h-full bg-tampon transition-[width] duration-500"
                    style={{ width: `${upload.sent * 100}%` }}
                  />
                </div>
                <p className="text-[15px] text-gris">
                  {upload.sent < 1
                    ? "Sur une connexion lente, un gros fichier peut prendre plusieurs minutes. Tant que les Mo avancent, l'envoi continue : garde cet onglet ouvert."
                    : "Fichier reçu. Le serveur prépare l'aperçu, ça ne prend qu'un instant."}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="lien-titre" className="space-y-4 border-t border-filet pt-8">
        <h2 id="lien-titre" className="text-2xl font-bold [font-stretch:92%]">Ou colle un lien</h2>

        {pcStatus !== "local" && (
          <p className="flex items-center gap-2.5 text-[15px] text-encre">
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                pcStatus === "online" ? "bg-ok" : pcStatus === "checking" ? "bg-filet-fort" : "bg-erreur"
              )}
            />
            {pcLine}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="url"
            aria-label="Lien de la vidéo"
            placeholder="https://youtube.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading || !linksAvailable}
          />
          <Button variant="outline" onClick={handleUrlSubmit} disabled={loading || !url || !linksAvailable}>
            {loading && !upload && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            Récupérer la vidéo
          </Button>
        </div>
      </section>

      {error && (
        <p role="alert" className="text-[15px] text-erreur">
          {/[.!?…]$/.test(error.trim()) ? error.trim() : `${error.trim()}.`} Vérifie la connexion puis réessaie ; pour un
          lien, le PC relais doit être allumé.
        </p>
      )}
      </div>
    </div>
  )
}
