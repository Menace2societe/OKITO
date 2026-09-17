"use client"

import * as React from "react"
import { Play, Pause } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type SubtitleStyle = "bold_tiktok" | "neon_yellow" | "minimal_clean"

interface SubtitleStepProps {
  fileUrl: string | null;
  startTime: number;
  endTime: number;
  subtitlesEnabled: boolean;
  subtitleStyle: SubtitleStyle;
  onToggle: (enabled: boolean) => void;
  onStyleChange: (style: SubtitleStyle) => void;
}

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

export function SubtitleStep({
  fileUrl,
  startTime,
  endTime,
  subtitlesEnabled,
  subtitleStyle,
  onToggle,
  onStyleChange,
}: SubtitleStepProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        video.pause()
        video.currentTime = startTime
        setIsPlaying(false)
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate)
    return () => video.removeEventListener("timeupdate", handleTimeUpdate)
  }, [startTime, endTime])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      if (video.currentTime >= endTime || video.currentTime < startTime) {
        video.currentTime = startTime
      }
      video.play()
    }
    setIsPlaying(!isPlaying)
  }

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
          <div className="flex flex-col items-center gap-3">
            <div
              className="relative overflow-hidden rounded-lg bg-black"
              style={{ width: 236, height: 420, maxWidth: "100%" }}
            >
              {fileUrl ? (
                <video
                  ref={videoRef}
                  src={fileUrl}
                  preload="metadata"
                  crossOrigin="anonymous"
                  className="h-full w-full object-cover"
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.currentTime = startTime
                    }
                  }}
                  onClick={togglePlay}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <p className="text-white text-sm text-center px-4">
                    Aucune vidéo à prévisualiser
                  </p>
                </div>
              )}

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
            </div>
            <Button variant="outline" size="sm" onClick={togglePlay}>
              {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isPlaying ? "Pause" : "Lire la sélection"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Aperçu du cadrage 9:16 et du placement des sous-titres
            </p>
          </div>

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
