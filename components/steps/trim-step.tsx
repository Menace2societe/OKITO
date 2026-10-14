"use client"

import * as React from "react"
import { Smartphone, Square, Monitor, Dices, Loader2, Palette, Sparkles, ScanFace } from "lucide-react"
import { DualRangeSlider } from "@/components/ui/dual-range-slider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"
import { CLIP_DURATIONS, VIDEO_FILTERS, type Moment, type WhisperQuality } from "@/lib/presets"
import { pollJob, postJson } from "@/lib/jobs"

interface TrimStepProps {
  fileId: string | null;
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  zoom: number;
  whisperQuality: WhisperQuality;
  vocabulary: string;
  videoFilter: VideoFilter;
  onZoomChange: (zoom: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onVideoFilterChange: (filter: VideoFilter) => void;
  onRandomLook: () => void;
  /** Apply a best moment: trim + its already-timed transcript. */
  onSelectMoment: (moment: Moment) => void;
}

const zoomLabel = (zoom: number) =>
  zoom === 0 ? "Vidéo entière" : zoom === 100 ? "Plein écran" : `Zoom ${zoom} %`

interface AnalyzeJob {
  status: "queued" | "processing" | "completed" | "failed"
  progress: number
  error: string | null
  result: { source: "claude" | "heuristic"; moments: Moment[] } | null
}

export function TrimStep({
  fileId,
  fileUrl,
  duration,
  startTime,
  endTime,
  aspectRatio,
  zoom,
  whisperQuality,
  vocabulary,
  videoFilter,
  onZoomChange,
  onTrimChange,
  onAspectRatioChange,
  onVideoFilterChange,
  onRandomLook,
  onSelectMoment,
}: TrimStepProps) {
  const playerRef = React.useRef<PreviewPlayerHandle>(null)
  const isVertical = aspectRatio.startsWith("9:16")
  const [currentTime, setCurrentTime] = React.useState(startTime)
  const [randomRange, setRandomRange] = React.useState(0)
  const [randomLoading, setRandomLoading] = React.useState(false)
  const [randomInfo, setRandomInfo] = React.useState<string | null>(null)
  const [analysis, setAnalysis] = React.useState<AnalyzeJob | null>(null)
  const stopPolling = React.useRef<(() => void) | null>(null)

  React.useEffect(() => () => stopPolling.current?.(), [])

  // Whisper transcribes the whole video once (cached), then Claude — or a
  // local scoring when no API key is set — ranks the strongest passages.
  const handleBestMoments = async () => {
    if (!fileId) return
    const range = CLIP_DURATIONS[randomRange]
    stopPolling.current?.()
    setAnalysis({ status: "queued", progress: 0, error: null, result: null })
    try {
      const { job_id } = await postJson<{ job_id: string }>("/api/analyze", {
        file_id: fileId, count: 5, min_duration: range.min, max_duration: range.max,
        quality: whisperQuality, vocabulary: vocabulary || null,
      })
      stopPolling.current = pollJob<AnalyzeJob>(
        `/api/status/${job_id}`,
        setAnalysis,
        (job) => job.status === "completed" || job.status === "failed",
        (error) => setAnalysis({ status: "failed", progress: 0, error, result: null })
      )
    } catch (e) {
      setAnalysis({ status: "failed", progress: 0, error: e instanceof Error ? e.message : "Erreur inconnue", result: null })
    }
  }

  const selectMoment = (moment: Moment) => {
    onSelectMoment(moment)
    playerRef.current?.seek(moment.start_time)
    setCurrentTime(moment.start_time)
  }

  // Ask the backend for a random window snapped to speech pauses, so the
  // clip doesn't start or end mid-sentence.
  const handleRandomClip = async () => {
    if (!fileId) return
    const range = CLIP_DURATIONS[randomRange]
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
          zoom={zoom}
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
              Aperçu du cadrage et du filtre appliqué
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
          <Button
            variant="secondary"
            onClick={handleBestMoments}
            disabled={!fileId || analysis?.status === "queued" || analysis?.status === "processing"}
          >
            {analysis?.status === "queued" || analysis?.status === "processing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Meilleurs moments
          </Button>
          {CLIP_DURATIONS.map((range, idx) => (
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
            "« Clip aléatoire » tire un extrait calé sur les pauses de la voix. « Meilleurs moments » analyse toute la vidéo pour trouver les passages les plus forts. « Look aléatoire » tire un filtre et un style de sous-titres."}
        </p>

        {(analysis?.status === "queued" || analysis?.status === "processing") && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Analyse de la vidéo complète ({analysis.progress}%) — la première fois, Whisper
            transcrit toute la vidéo, ce qui peut prendre quelques minutes.
          </p>
        )}
        {analysis?.status === "failed" && (
          <p className="text-xs text-destructive">{analysis.error}</p>
        )}
        {analysis?.status === "completed" && analysis.result && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {analysis.result.source === "claude"
                ? "Moments choisis par Claude :"
                : "Moments classés localement (définissez ANTHROPIC_API_KEY pour un choix par Claude) :"}
            </p>
            {analysis.result.moments.length === 0 && (
              <p className="text-xs text-muted-foreground">Aucun passage trouvé pour cette durée.</p>
            )}
            {analysis.result.moments.map((moment) => {
              const active = moment.start_time === startTime && moment.end_time === endTime
              return (
                <button
                  key={`${moment.start_time}-${moment.end_time}`}
                  onClick={() => selectMoment(moment)}
                  className={cn(
                    "w-full rounded-md border p-3 text-left text-sm transition-colors hover:bg-accent",
                    active && "border-primary bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{moment.title}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {formatTime(moment.start_time)}–{formatTime(moment.end_time)} · {moment.score}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{moment.reason}</p>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <div className="space-y-4">
        <h3 className="font-semibold">Format</h3>
        <div className="grid grid-cols-3 gap-4">
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              isVertical && "border-primary bg-primary/5"
            )}
            onClick={() => !isVertical && onAspectRatioChange("9:16_fit")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Smartphone className="h-8 w-8" />
              <div className="text-sm font-medium">Reels / TikTok</div>
              <div className="text-xs text-muted-foreground">9:16</div>
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

        {isVertical && (
          <Card className="space-y-4 p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <Label>Cadrage</Label>
                <span className="font-mono text-xs text-muted-foreground">{zoomLabel(zoom)}</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[zoom]}
                onValueChange={(val) => onZoomChange(val[0])}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Vidéo entière (rien n&apos;est coupé)</span>
                <span>Plein écran (bords coupés)</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="follow-face"
                checked={aspectRatio === "9:16_face"}
                onCheckedChange={(on) => {
                  onAspectRatioChange(on ? "9:16_face" : "9:16_fit")
                  // Following a face needs room to move: zoom in a bit.
                  if (on && zoom < 30) onZoomChange(60)
                }}
              />
              <Label htmlFor="follow-face" className="flex items-center gap-2 text-sm font-normal">
                <ScanFace className="h-4 w-4" />
                Suivre le visage
                <span className="text-xs text-muted-foreground">
                  (appliqué au rendu ; l&apos;aperçu reste centré)
                </span>
              </Label>
            </div>
          </Card>
        )}
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
