"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { DualRangeSlider } from "@/components/ui/dual-range-slider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"
import { TIRAGE_FRAME, Tampon, formatClock } from "@/components/tirage"
import { CLIP_DURATIONS, VIDEO_FILTERS, type Moment, type WhisperQuality } from "@/lib/presets"
import { apiFetch } from "@/lib/backend"
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
  isolateVocals: boolean;
  videoFilter: VideoFilter;
  onZoomChange: (zoom: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onVideoFilterChange: (filter: VideoFilter) => void;
  onRandomLook: () => void;
  /** Apply a best moment: trim + its already-timed transcript. */
  onSelectMoment: (moment: Moment) => void;
}

// The print is sized to sit beside the controls on a laptop screen.
const TIRAGE_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 270, height: 480 },
  "9:16_fit": { width: 270, height: 480 },
  "9:16_face": { width: 270, height: 480 },
  "1:1": { width: 420, height: 420 },
  "16:9": { width: 560, height: 315 },
}

const FORMATS: { value: "9:16" | "1:1" | "16:9"; name: string; use: string }[] = [
  { value: "9:16", name: "Vertical 9:16", use: "TikTok, Reels, Shorts" },
  { value: "1:1", name: "Carré 1:1", use: "Instagram" },
  { value: "16:9", name: "Horizontal 16:9", use: "YouTube" },
]

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
  isolateVocals,
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
  // Bumped when a moment or a random clip is picked: the stamp lands again.
  const [stampKey, setStampKey] = React.useState(0)

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
        isolate_vocals: isolateVocals,
      })
      stopPolling.current = pollJob<AnalyzeJob>(
        `/api/status/${job_id}`,
        setAnalysis,
        (job) => job.status === "completed" || job.status === "failed",
        (error) => setAnalysis({ status: "failed", progress: 0, error, result: null })
      )
    } catch (e) {
      setAnalysis({ status: "failed", progress: 0, error: e instanceof Error ? e.message : "L'analyse n'a pas pu démarrer. Vérifie la connexion, puis relance.", result: null })
    }
  }

  const selectMoment = (moment: Moment) => {
    onSelectMoment(moment)
    setStampKey((k) => k + 1)
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
      const res = await apiFetch("/api/random-clip", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, min_duration: range.min, max_duration: range.max }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Le serveur n'a pas pu choisir de clip. Réessaie ou change la durée.")
      onTrimChange(data.start_time, data.end_time)
      setStampKey((k) => k + 1)
      playerRef.current?.seek(data.start_time)
      setCurrentTime(data.start_time)
      setRandomInfo(
        data.snapped
          ? "Clip calé sur les pauses de la voix."
          : "Aucune pause nette détectée : extrait choisi au hasard."
      )
    } catch (e) {
      setRandomInfo(e instanceof Error ? e.message : "Le clip aléatoire n'a pas pu être choisi. Vérifie la connexion, puis réessaie.")
    } finally {
      setRandomLoading(false)
    }
  }

  const analyzing = analysis?.status === "queued" || analysis?.status === "processing"
  const currentFormat = isVertical ? "9:16" : aspectRatio
  const filter = VIDEO_FILTERS.find((f) => f.value === videoFilter)
  const framing = isVertical
    ? aspectRatio === "9:16_face" ? "Visage suivi" : zoomLabel(zoom)
    : null

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
        <PreviewPlayer
          ref={playerRef}
          src={fileUrl}
          selectedFilter={videoFilter}
          aspectRatio={aspectRatio}
          zoom={zoom}
          startTime={startTime}
          endTime={endTime}
          size={TIRAGE_SIZES[aspectRatio]}
          frameClassName={TIRAGE_FRAME}
          frameFooter={
            // w-0 min-w-full: the caption never widens the print past the image.
            <div className="flex w-0 min-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <p className="text-[15px] leading-snug text-gris">
                {[framing, filter?.label].filter(Boolean).join(" · ")}
              </p>
              <Tampon
                start={startTime}
                end={endTime}
                detail={currentFormat}
                landKey={stampKey}
                className="ml-auto shrink-0"
              />
            </div>
          }
          onTimeUpdate={setCurrentTime}
          onLoadedDuration={(realDuration) => {
            // Sync real duration from the video file
            if (realDuration > 0 && Math.abs(realDuration - duration) > 1) {
              onTrimChange(startTime, realDuration)
            }
          }}
        />
      </div>

      <div className="min-w-0 space-y-10">
        <section aria-labelledby="passage-titre" className="space-y-6">
          <h1 id="passage-titre" className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
            Choisis le passage
          </h1>

          <div>
            <div className="chiffres mb-2.5 flex items-baseline justify-between gap-3 text-[15px] text-gris">
              <span>00:00</span>
              <span className="text-center text-base font-semibold text-encre">
                Sélection {formatClock(startTime)} → {formatClock(endTime)}
                <span className="hidden font-normal text-gris sm:inline"> · lecture {formatClock(currentTime)}</span>
              </span>
              <span>{formatClock(duration)}</span>
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

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={handleBestMoments}
              disabled={!fileId || analyzing}
              aria-busy={analyzing}
            >
              {analyzing && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              Meilleurs moments
            </Button>
            <Button variant="outline" onClick={handleRandomClip} disabled={!fileId || randomLoading}>
              {randomLoading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              Clip aléatoire
            </Button>
            <div role="group" aria-label="Durée du clip" className="flex border border-filet-fort">
              {CLIP_DURATIONS.map((range, idx) => (
                <button
                  key={range.label}
                  aria-pressed={idx === randomRange}
                  onClick={() => setRandomRange(idx)}
                  className={cn(
                    "chiffres h-12 border-r border-filet px-4 text-base last:border-r-0",
                    idx === randomRange ? "bg-encre font-semibold text-white" : "bg-papier hover:bg-accent"
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={onRandomLook}>
              Look aléatoire
            </Button>
          </div>

          <p className="max-w-[68ch] text-[15px] text-gris" aria-live="polite">
            {randomInfo ??
              "Meilleurs moments écoute toute la vidéo et propose les passages les plus forts. Clip aléatoire tire un extrait calé sur les pauses de la voix. Look aléatoire change le filtre et le style des sous-titres."}
          </p>

          {analysis && (
            <div aria-live="polite" className="space-y-3">
              {analyzing && (
                <div className="space-y-2">
                  <p className="text-[15px] text-encre">
                    Écoute de la vidéo entière : {analysis.progress} %. La première fois, la
                    transcription peut prendre quelques minutes.
                  </p>
                  <div className="h-1.5 bg-filet">
                    <div
                      className="h-full bg-tampon transition-[width] duration-500"
                      style={{ width: `${analysis.progress}%` }}
                    />
                  </div>
                </div>
              )}
              {analysis.status === "failed" && (
                <p className="text-[15px] text-erreur">
                  {analysis.error} Relance « Meilleurs moments » ; si l&apos;erreur revient, vérifie que le serveur tourne.
                </p>
              )}
              {analysis.status === "completed" && analysis.result && (
                <div className="border border-filet bg-papier">
                  <div
                    aria-hidden
                    className="hidden grid-cols-[minmax(0,1fr)_9.5rem_5rem_4.5rem] gap-4 border-b border-filet px-4 py-3 text-[15px] font-semibold text-gris md:grid"
                  >
                    <span>Extrait</span>
                    <span>Début – fin</span>
                    <span className="text-right">Durée</span>
                    <span className="text-right">Score</span>
                  </div>
                  {analysis.result.moments.length === 0 ? (
                    <p className="px-4 py-4 text-[15px] text-gris">
                      Aucun passage trouvé pour cette durée. Essaie une autre durée.
                    </p>
                  ) : (
                    <ul>
                      {analysis.result.moments.map((moment) => {
                        const active = moment.start_time === startTime && moment.end_time === endTime
                        return (
                          <li key={`${moment.start_time}-${moment.end_time}`} className="border-b border-filet last:border-b-0">
                            <button
                              onClick={() => selectMoment(moment)}
                              aria-pressed={active}
                              className={cn(
                                "chiffres grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors md:grid-cols-[minmax(0,1fr)_9.5rem_5rem_4.5rem]",
                                active ? "bg-tampon/[0.08]" : "hover:bg-accent"
                              )}
                            >
                              <span className="col-span-2 md:col-span-1">
                                <span className={cn("block text-base", active && "font-semibold text-tampon")}>
                                  {moment.title}
                                </span>
                                <span className="block text-[15px] text-gris">{moment.reason}</span>
                              </span>
                              <span className="text-base">
                                {formatClock(moment.start_time)} – {formatClock(moment.end_time)}
                              </span>
                              <span className="text-right text-base">
                                {Math.round(moment.end_time - moment.start_time)} s
                                <span className="text-gris md:hidden"> · score {moment.score}</span>
                              </span>
                              <span className="hidden text-right text-base md:block">{moment.score}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <p className="border-t border-filet px-4 py-3 text-[15px] text-gris">
                    {analysis.result.source === "claude"
                      ? "Moments choisis par Claude."
                      : "Moments classés par le score local (débit, volume, mots d'accroche). Ajoute ANTHROPIC_API_KEY au serveur pour laisser Claude choisir."}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="format-titre" className="space-y-4 border-t border-filet pt-8">
          <h2 id="format-titre" className="text-2xl font-bold [font-stretch:92%]">Format</h2>
          <div role="radiogroup" aria-labelledby="format-titre" className="grid gap-px border border-filet bg-filet sm:grid-cols-3">
            {FORMATS.map((format) => {
              const on = currentFormat === format.value
              return (
                <button
                  key={format.value}
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (format.value !== "9:16") onAspectRatioChange(format.value)
                    else if (!isVertical) onAspectRatioChange("9:16_fit")
                  }}
                  className={cn(
                    "min-h-[72px] px-4 py-3 text-left transition-colors",
                    on ? "bg-encre text-white" : "bg-papier hover:bg-accent"
                  )}
                >
                  <span className="block text-base font-semibold">{format.name}</span>
                  <span className={cn("block text-[15px]", on ? "text-white/80" : "text-gris")}>{format.use}</span>
                </button>
              )
            })}
          </div>

          {isVertical && (
            <div className="space-y-5 border border-filet bg-papier p-5">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <Label className="text-base font-semibold">Cadrage</Label>
                  <span className="chiffres text-[15px] text-gris">{zoomLabel(zoom)}</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[zoom]}
                  onValueChange={(val) => onZoomChange(val[0])}
                  aria-label="Cadrage"
                />
                <div className="flex justify-between gap-4 text-[15px] text-gris">
                  <span>Vidéo entière, rien n&apos;est coupé</span>
                  <span className="text-right">Plein écran, bords coupés</span>
                </div>
              </div>
              <div className="flex min-h-12 items-center gap-3">
                <Switch
                  id="follow-face"
                  checked={aspectRatio === "9:16_face"}
                  onCheckedChange={(on) => {
                    onAspectRatioChange(on ? "9:16_face" : "9:16_fit")
                    // Following a face needs room to move: zoom in a bit.
                    if (on && zoom < 30) onZoomChange(60)
                  }}
                />
                <Label htmlFor="follow-face" className="text-base font-normal">
                  Suivre le visage
                  <span className="block text-[15px] text-gris">Appliqué au rendu ; l&apos;aperçu reste centré.</span>
                </Label>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="filtre-titre" className="space-y-3 border-t border-filet pt-8">
          <h2 id="filtre-titre" className="text-2xl font-bold [font-stretch:92%]">Filtre vidéo</h2>
          <Select
            value={videoFilter}
            onValueChange={(val) => onVideoFilterChange(val as VideoFilter)}
          >
            <SelectTrigger className="w-full max-w-sm" aria-labelledby="filtre-titre">
              <SelectValue placeholder="Choisir un filtre" />
            </SelectTrigger>
            <SelectContent>
              {VIDEO_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[15px] text-gris">{filter?.description}</p>
        </section>
      </div>
    </div>
  )
}
