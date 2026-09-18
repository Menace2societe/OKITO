"use client"

import * as React from "react"
import { Wand2, Loader2, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PreviewPlayer, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"

type SubtitleStyle = "bold_tiktok" | "neon_yellow" | "minimal_clean"

interface SubtitleStepProps {
  fileId: string | null;
  videoPath: string | null;
  fileUrl: string | null;
  startTime: number;
  endTime: number;
  subtitlesEnabled: boolean;
  subtitleStyle: SubtitleStyle;
  videoFilter: VideoFilter;
  customSubtitles: string;
  onToggle: (enabled: boolean) => void;
  onStyleChange: (style: SubtitleStyle) => void;
  onCustomSubtitlesChange: (text: string) => void;
}

const MAX_WORDS_PER_LINE = 4

const SUBTITLE_PRESETS: {
  value: SubtitleStyle
  label: string
  description: string
  sampleClass: string
}[] = [
  {
    value: "bold_tiktok",
    label: "Bold TikTok",
    description: "Blanc, contour noir épais (Outline 3), taille 72",
    sampleClass: "font-extrabold text-white",
  },
  {
    value: "neon_yellow",
    label: "Neon Yellow",
    description: "Jaune vif, contour noir, style dynamique",
    sampleClass: "font-extrabold text-yellow-300",
  },
  {
    value: "minimal_clean",
    label: "Minimal Clean",
    description: "Blanc pur, ombre légère (Shadow 1), taille 60",
    sampleClass: "font-medium text-white",
  },
]

function normalizeSubtitleText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  for (let i = 0; i < words.length; i += MAX_WORDS_PER_LINE) {
    lines.push(words.slice(i, i + MAX_WORDS_PER_LINE).join(" "))
  }
  return lines.join("\n")
}

export function SubtitleStep({
  fileId,
  videoPath,
  fileUrl,
  startTime,
  endTime,
  subtitlesEnabled,
  subtitleStyle,
  videoFilter,
  customSubtitles,
  onToggle,
  onStyleChange,
  onCustomSubtitlesChange,
}: SubtitleStepProps) {
  const [loadingTranscribe, setLoadingTranscribe] = React.useState(false)
  const [transcribeError, setTranscribeError] = React.useState<string | null>(null)
  const [applied, setApplied] = React.useState(false)

  const fetchTranscription = async () => {
    if (!fileId && !videoPath) return
    setLoadingTranscribe(true)
    setTranscribeError(null)
    setApplied(false)
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: fileId || "",
          video_path: videoPath || "",
          start_time: Number(startTime) || 0,
          end_time: Number(endTime) || 0,
        }),
      })
      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const rawText = await res.text()
        console.error("[ClipFlow] Réponse brute non-JSON du serveur :", rawText)
        throw new Error("Le serveur a renvoyé une erreur HTML au lieu d'un JSON.")
      }

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || "Erreur lors de la génération des sous-titres.")
      }
      onCustomSubtitlesChange(normalizeSubtitleText(data.text || ""))
    } catch (e) {
      setTranscribeError(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setLoadingTranscribe(false)
    }
  }

  const handleApply = () => {
    onCustomSubtitlesChange(normalizeSubtitleText(customSubtitles))
    setApplied(true)
  }

  // Auto-load the initial transcription once, when subtitles are enabled and
  // the field is still empty (e.g. arriving on the Subtitles step).
  const autoLoadedSource = React.useRef<string | null>(null)
  const sourceKey = videoPath || fileId || ""

  React.useEffect(() => {
    if (!subtitlesEnabled) return
    if (!sourceKey) return
    if (customSubtitles.trim()) return
    if (loadingTranscribe) return
    if (autoLoadedSource.current === sourceKey) return

    autoLoadedSource.current = sourceKey
    void fetchTranscription()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitlesEnabled, sourceKey, customSubtitles, loadingTranscribe])

  const wordCount = customSubtitles.split(/\s+/).filter(Boolean).length
  const activePreset = SUBTITLE_PRESETS.find((p) => p.value === subtitleStyle)

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between p-6">
        <div className="space-y-1">
          <Label htmlFor="subtitles-toggle" className="text-base">
            Activer les sous-titres
          </Label>
          <p className="text-sm text-muted-foreground">
            Générer automatiquement des sous-titres pour la vidéo
          </p>
        </div>
        <Switch
          id="subtitles-toggle"
          checked={subtitlesEnabled}
          onCheckedChange={onToggle}
        />
      </Card>

      {subtitlesEnabled && (
        <div className="space-y-6 animate-in slide-in-from-top-4 fade-in-50">
          <PreviewPlayer
            src={fileUrl}
            selectedFilter={videoFilter}
            aspectRatio="9:16"
            startTime={startTime}
            endTime={endTime}
            showControls={false}
            caption={
              <p className="text-xs text-muted-foreground">
                Aperçu du cadrage 9:16, du filtre et du placement des sous-titres
              </p>
            }
          >
            {/* Subtitle placement preview for the selected preset */}
            <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-3">
              <span
                className={cn(
                  "rounded px-2 text-center text-base leading-tight",
                  activePreset?.sampleClass,
                  subtitleStyle === "bold_tiktok" &&
                    "drop-shadow-[0_0_2px_#000] [text-shadow:0_0_3px_#000,0_0_3px_#000]",
                  subtitleStyle === "neon_yellow" &&
                    "[text-shadow:0_0_4px_#000,0_0_4px_#000]",
                  subtitleStyle === "minimal_clean" &&
                    "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                )}
              >
                Aperçu du sous-titre
              </span>
            </div>
          </PreviewPlayer>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="custom-subtitles" className="text-base">
                Texte des sous-titres
              </Label>
              <span className="text-xs text-muted-foreground">
                {wordCount} mot{wordCount > 1 ? "s" : ""} · {MAX_WORDS_PER_LINE} max/ligne
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Corrigez la transcription ou collez vos paroles. Le texte est
              automatiquement découpé en lignes de {MAX_WORDS_PER_LINE} mots et
              le timing est réparti sur la durée de l&apos;extrait.
            </p>
            <textarea
              id="custom-subtitles"
              value={customSubtitles}
              onChange={(e) => {
                onCustomSubtitlesChange(e.target.value)
                setApplied(false)
              }}
              rows={8}
              placeholder={
                "Collez ici vos paroles ou la transcription...\nEx : On arrive dans le game, personne ne peut nous stopper"
              }
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={fetchTranscription}
                disabled={loadingTranscribe || (!fileId && !videoPath)}
              >
                {loadingTranscribe ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Générer depuis l&apos;audio
              </Button>
              <Button onClick={handleApply} disabled={!customSubtitles.trim()}>
                <Check className="mr-2 h-4 w-4" />
                Appliquer / Régénérer les sous-titres
              </Button>
            </div>

            {loadingTranscribe && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Chargement de la transcription… cela peut prendre quelques minutes.
              </p>
            )}
            {transcribeError && (
              <div className="rounded-lg bg-destructive/15 p-3 text-sm text-destructive border border-destructive/50">
                {transcribeError}
              </div>
            )}
            {applied && !transcribeError && (
              <div className="rounded-lg bg-green-600/15 p-3 text-sm text-green-700 border border-green-600/40">
                Sous-titres appliqués : ils seront utilisés à la place de la
                transcription Whisper lors du rendu.
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <h3 className="font-semibold">Style des sous-titres</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {SUBTITLE_PRESETS.map((preset) => (
                <Card
                  key={preset.value}
                  className={cn(
                    "cursor-pointer p-4 transition-colors hover:bg-accent",
                    subtitleStyle === preset.value && "border-primary bg-primary/5"
                  )}
                  onClick={() => onStyleChange(preset.value)}
                >
                  <h4 className="font-semibold">{preset.label}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {preset.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          <Badge variant="secondary" className="mt-4">
            Transcription locale via Whisper (aucun service cloud)
          </Badge>
        </div>
      )}
    </div>
  )
}
