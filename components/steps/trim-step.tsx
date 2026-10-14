"use client"

import * as React from "react"
import { Smartphone, Square, Monitor, Dices, Loader2, Palette } from "lucide-react"
import { DualRangeSlider } from "@/components/ui/dual-range-slider"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"
import { VIDEO_FILTERS } from "@/lib/presets"

interface TrimStepProps {
  fileId: string | null;
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  videoFilter: VideoFilter;
  onTrimChange: (start: number, end: number) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onVideoFilterChange: (filter: VideoFilter) => void;
  onRandomLook: () => void;
}

// Durations offered for random clips (seconds) — Shorts cap at 60 s.
const RANDOM_DURATIONS = [
  { label: "15–30 s", min: 15, max: 30 },
  { label: "30–60 s", min: 30, max: 60 },
  { label: "60–90 s", min: 60, max: 90 },
]

export function TrimStep({
  fileId,
  fileUrl,
  duration,
  startTime,
  endTime,
  aspectRatio,
  videoFilter,
  onTrimChange,
  onAspectRatioChange,
  onVideoFilterChange,
  onRandomLook,
}: TrimStepProps) {
  const playerRef = React.useRef<PreviewPlayerHandle>(null)
  const [currentTime, setCurrentTime] = React.useState(startTime)
  const [randomRange, setRandomRange] = React.useState(0)
  const [randomLoading, setRandomLoading] = React.useState(false)
  const [randomInfo, setRandomInfo] = React.useState<string | null>(null)

  // Ask the backend for a random window snapped to speech pauses, so the
  // clip doesn't start or end mid-sentence.
  const handleRandomClip = async () => {
    if (!fileId) return
    const range = RANDOM_DURATIONS[randomRange]
    setRandomLoading(true)
    setRandomInfo(null)
    try {
      const res = await fetch("/api/random-clip", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, min_duration: range.min, max_duration: range.max }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Impossible de choisir un clip aléatoire.")
      onTrimChange(data.start_time, data.end_time)
      playerRef.current?.seek(data.start_time)
      setCurrentTime(data.start_time)
      setRandomInfo(
        data.snapped
          ? "Clip calé sur les pauses de la voix."
          : "Aucune pause nette détectée : extrait choisi au hasard."
      )
    } catch (e) {
      setRandomInfo(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setRandomLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-8">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <PreviewPlayer
          ref={playerRef}
          src={fileUrl}
          selectedFilter={videoFilter}
          aspectRatio={aspectRatio}
          startTime={startTime}
          endTime={endTime}
          onTimeUpdate={setCurrentTime}
          onLoadedDuration={(realDuration) => {
            // Sync real duration from the video file
            if (realDuration > 0 && Math.abs(realDuration - duration) > 1) {
              onTrimChange(startTime, realDuration)
            }
          }}
          caption={
            <p className="text-center text-xs text-muted-foreground">
              Aperçu du cadrage {aspectRatio} et du filtre appliqué
            </p>
          }
        />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between font-mono text-sm">
          <span>{formatTime(startTime)}</span>
          <span className="text-primary">{formatTime(currentTime)}</span>
          <span>{formatTime(endTime)}</span>
        </div>
        <DualRangeSlider
          min={0}
          max={duration}
          step={0.1}
          value={[startTime, endTime]}
          onValueChange={(val) => {
            onTrimChange(val[0], val[1])
            playerRef.current?.seek(val[0])
            setCurrentTime(val[0])
          }}
        />
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleRandomClip} disabled={!fileId || randomLoading}>
            {randomLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Dices className="mr-2 h-4 w-4" />
            )}
            Clip aléatoire
          </Button>
          {RANDOM_DURATIONS.map((range, idx) => (
            <Button
              key={range.label}
              size="sm"
              variant={idx === randomRange ? "secondary" : "ghost"}
              onClick={() => setRandomRange(idx)}
            >
              {range.label}
            </Button>
          ))}
          <Button variant="outline" className="ml-auto" onClick={onRandomLook}>
            <Palette className="mr-2 h-4 w-4" />
            Look aléatoire
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {randomInfo ??
            "Choisit un extrait au hasard, calé sur les pauses de la voix. « Look aléatoire » tire un filtre et un style de sous-titres."}
        </p>
      </Card>

      <div className="space-y-4">
        <h3 className="font-semibold">Format</h3>
        <div className="grid grid-cols-2 gap-4">
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "9:16_fit" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("9:16_fit")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Smartphone className="h-8 w-8" />
              <div className="text-sm font-medium">Reels / TikTok</div>
              <div className="text-xs text-muted-foreground">9:16 — Vidéo entière</div>
              <span className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Recommandé
              </span>
            </div>
          </Card>
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "9:16" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("9:16")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Smartphone className="h-8 w-8" />
              <div className="text-sm font-medium">Reels / TikTok</div>
              <div className="text-xs text-muted-foreground">9:16 — Crop centré</div>
            </div>
          </Card>
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "1:1" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("1:1")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Square className="h-8 w-8" />
              <div className="text-sm font-medium">Instagram</div>
              <div className="text-xs text-muted-foreground">1:1</div>
            </div>
          </Card>
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "16:9" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("16:9")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Monitor className="h-8 w-8" />
              <div className="text-sm font-medium">YouTube</div>
              <div className="text-xs text-muted-foreground">16:9</div>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Filtre vidéo</h3>
        <Select
          value={videoFilter}
          onValueChange={(val) => onVideoFilterChange(val as VideoFilter)}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Choisir un filtre" />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {VIDEO_FILTERS.find((f) => f.value === videoFilter)?.description}
        </p>
      </div>
    </div>
  )
}
