"use client"

import * as React from "react"
import { Upload, Link as LinkIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface ImportStepProps {
  onFileImported: (
    fileId: string,
    fileName: string,
    fileUrl: string,
    duration: number,
    videoPath: string
  ) => void;
}

export function ImportStep({ onFileImported }: ImportStepProps) {
  const [dragActive, setDragActive] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [url, setUrl] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)

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

  const processFile = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/upload", { method: "POST", body: formData })

      if (!res.ok) {
        // Try to parse JSON error, fall back to status text if body isn't JSON
        let message = `Erreur serveur (${res.status})`
        try {
          const err = await res.json()
          message = err.detail || message
        } catch {
          // Response body wasn't JSON (e.g. HTML error page) — use fallback
        }
        throw new Error(message)
      }

      const data = await res.json()
      onFileImported(data.file_id, data.original_name, data.preview_url, data.duration, data.video_path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  const handleUrlSubmit = async () => {
    if (!url) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/download-url", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })

      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const rawText = await res.text()
        console.error("[ClipFlow Import] Réponse brute non-JSON :", rawText)
        throw new Error("Le serveur a renvoyé une réponse invalide pendant l'import.")
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Erreur lors du téléchargement de la vidéo.")
      }

      onFileImported(data.file_id, data.title, data.preview_url, data.duration, data.video_path)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div
        className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
          dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/50"
        }`}
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
        <div className="flex flex-col items-center space-y-4 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Upload className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">Glissez votre vidéo ici</h3>
            <p className="text-sm text-muted-foreground">ou</p>
          </div>
          <Button onClick={() => inputRef.current?.click()} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Parcourir
          </Button>
          <p className="text-xs text-muted-foreground">.mp4, .mkv, .mov, .mp3 acceptés</p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            ou collez un lien
          </span>
        </div>
      </div>

      <div className="flex space-x-2">
        <Input
          placeholder="https://youtube.com/..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <Button onClick={handleUrlSubmit} disabled={loading || !url}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <LinkIcon className="mr-2 h-4 w-4" />
          )}
          Télécharger
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive border border-destructive/50">
          {error}
        </div>
      )}
    </div>
  )
}
