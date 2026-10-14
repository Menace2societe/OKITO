"use client"

import * as React from "react"
import { Layers, Loader2, Download, Dices, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { pollJob, postJson } from "@/lib/jobs"
import { CLIP_DURATIONS, SUBTITLE_STYLES, VIDEO_FILTERS } from "@/lib/presets"
import type { ProjectState } from "@/components/step-wizard"

type JobStatus = "queued" | "processing" | "completed" | "failed"

interface Job {
  id: string
  label: string | null
  status: JobStatus
  progress: number
  output_url: string | null
  srt_url: string | null
  error: string | null
}

interface BatchResponse {
  batch: Job & { result: { picked_by: "random" | "claude" | "heuristic" } | null }
  clips: Job[]
}

const COUNTS = [3, 5, 10]
const PICKED_BY_LABEL = {
  random: "extraits aléatoires",
  claude: "moments choisis par Claude",
  heuristic: "moments classés localement",
}

type BatchPanelProps = Pick<
  ProjectState,
  "fileId" | "aspectRatio" | "subtitlesEnabled" | "subtitleStyle" | "videoFilter" | "outputFormat"
>

export function BatchPanel(props: BatchPanelProps) {
  const [mode, setMode] = React.useState<"random" | "best">("best")
  const [count, setCount] = React.useState(5)
  const [range, setRange] = React.useState(0)
  const [randomLook, setRandomLook] = React.useState(true)
  const [data, setData] = React.useState<BatchResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const stopPolling = React.useRef<(() => void) | null>(null)

  React.useEffect(() => () => stopPolling.current?.(), [])

  const running = data?.batch.status === "queued" || data?.batch.status === "processing"

  const launch = async () => {
    if (!props.fileId) return
    stopPolling.current?.()
    setError(null)
    setData(null)
    try {
      const { batch_id } = await postJson<{ batch_id: string }>("/api/batch", {
        file_id: props.fileId,
        mode,
        count,
        min_duration: CLIP_DURATIONS[range].min,
        max_duration: CLIP_DURATIONS[range].max,
        aspect_ratio: props.aspectRatio,
        subtitles_enabled: props.subtitlesEnabled,
        style_preset: props.subtitleStyle,
        video_filter: props.videoFilter,
        output_format: props.outputFormat,
        random_look: randomLook,
      })
      stopPolling.current = pollJob<BatchResponse>(
        `/api/batch/${batch_id}`,
        setData,
        (d) => d.batch.status === "completed" || d.batch.status === "failed",
        setError
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }

  const filterLabel = VIDEO_FILTERS.find((f) => f.value === props.videoFilter)?.label
  const styleLabel = SUBTITLE_STYLES.find((s) => s.value === props.subtitleStyle)?.label

  return (
    <Card className="space-y-4 p-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 font-semibold">
          <Layers className="h-4 w-4" />
          Plusieurs clips en un lancement
        </h3>
        <p className="text-sm text-muted-foreground">
          Génère une série de clips de cette vidéo avec le format {props.aspectRatio}
          {props.subtitlesEnabled ? " et des sous-titres" : ""}.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "best" ? "secondary" : "ghost"} onClick={() => setMode("best")}>
          <Sparkles className="mr-2 h-4 w-4" />
          Meilleurs moments
        </Button>
        <Button size="sm" variant={mode === "random" ? "secondary" : "ghost"} onClick={() => setMode("random")}>
          <Dices className="mr-2 h-4 w-4" />
          Aléatoires
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Nombre :</span>
        {COUNTS.map((n) => (
          <Button key={n} size="sm" variant={n === count ? "secondary" : "ghost"} onClick={() => setCount(n)}>
            {n}
          </Button>
        ))}
        <span className="ml-2 text-muted-foreground">Durée :</span>
        {CLIP_DURATIONS.map((d, idx) => (
          <Button key={d.label} size="sm" variant={idx === range ? "secondary" : "ghost"} onClick={() => setRange(idx)}>
            {d.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Switch id="batch-random-look" checked={randomLook} onCheckedChange={setRandomLook} />
        <Label htmlFor="batch-random-look" className="text-sm font-normal">
          {randomLook
            ? "Look différent pour chaque clip (filtre + style de sous-titres)"
            : `Même look pour tous : ${filterLabel}${props.subtitlesEnabled ? ` · ${styleLabel}` : ""}`}
        </Label>
      </div>

      <Button className="w-full" onClick={launch} disabled={!props.fileId || running}>
        {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
        Générer {count} clips
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {data.batch.status === "failed"
                  ? data.batch.error
                  : data.batch.result
                    ? `${data.clips.length} ${PICKED_BY_LABEL[data.batch.result.picked_by]}`
                    : mode === "best"
                      ? "Analyse de la vidéo (Whisper sur la vidéo entière la première fois)…"
                      : "Choix des extraits…"}
              </span>
              <span>{data.batch.progress}%</span>
            </div>
            <Progress value={data.batch.progress} />
          </div>

          {data.clips.map((clip, idx) => (
            <div
              key={clip.id}
              className={cn(
                "flex items-center justify-between gap-3 rounded-md border p-3 text-sm",
                clip.status === "failed" && "border-destructive/50"
              )}
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{clip.label || `Clip ${idx + 1}`}</p>
                <p className="text-xs text-muted-foreground">
                  {clip.status === "completed" && "Prêt"}
                  {clip.status === "processing" && `Rendu en cours… ${clip.progress}%`}
                  {clip.status === "queued" && "En attente"}
                  {clip.status === "failed" && (clip.error || "Échec")}
                </p>
              </div>
              {clip.status === "completed" && clip.output_url ? (
                <div className="flex shrink-0 items-center gap-3">
                  {clip.srt_url && (
                    <a href={clip.srt_url} download className="text-xs text-primary underline underline-offset-4">
                      .srt
                    </a>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <a href={clip.output_url} download={`clipflow_${idx + 1}.${props.outputFormat}`}>
                      <Download className="mr-2 h-4 w-4" />
                      Télécharger
                    </a>
                  </Button>
                </div>
              ) : (
                clip.status !== "failed" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
