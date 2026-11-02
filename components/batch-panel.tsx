"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { downloadUrl } from "@/lib/backend"
import { pollJob, postJson } from "@/lib/jobs"
import { CLIP_DURATIONS, SUBTITLE_STYLES, VIDEO_FILTERS } from "@/lib/presets"
import { formatClock, formatLength } from "@/components/tirage"
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
  batch: Job & {
    result: {
      picked_by: "random" | "claude" | "heuristic"
      /** The picked passages, in the same order as the render jobs. */
      clips?: { start_time: number; end_time: number }[]
    } | null
  }
  clips: Job[]
}

const COUNTS = [3, 5, 10]
const MODES: { value: "best" | "random"; label: string }[] = [
  { value: "best", label: "Meilleurs moments" },
  { value: "random", label: "Aléatoires" },
]
const PICKED_BY_LABEL = {
  random: "extraits aléatoires",
  claude: "moments choisis par Claude",
  heuristic: "moments classés par le score local",
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: "En attente",
  processing: "Rendu",
  completed: "Prêt",
  failed: "Échec",
}

// n°, passage, durée, état, lien: same widths whatever the values.
const COLUMNS = "grid-cols-[2.5rem_minmax(0,1fr)_6.5rem] md:grid-cols-[2.5rem_minmax(0,1fr)_6.5rem_minmax(0,1fr)_9.5rem]"

type BatchPanelProps = Pick<
  ProjectState,
  | "fileId" | "aspectRatio" | "zoom" | "subtitlesEnabled" | "subtitleStyle" | "videoFilter"
  | "outputFormat" | "whisperQuality" | "vocabulary" | "isolateVocals"
>

function Collees<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-base font-semibold">{label}</p>
      <div role="group" aria-label={label} className="flex w-fit max-w-full flex-wrap border border-filet-fort">
        {options.map((option) => (
          <button
            key={String(option.value)}
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              "chiffres h-12 border-r border-filet px-4 text-base last:border-r-0",
              option.value === value ? "bg-encre font-semibold text-white" : "bg-papier hover:bg-accent"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

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
        zoom: props.aspectRatio.startsWith("9:16") ? props.zoom : null,
        quality: props.whisperQuality,
        vocabulary: props.vocabulary || null,
        isolate_vocals: props.isolateVocals,
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
      setError(e instanceof Error ? e.message : "La série n'a pas pu démarrer. Vérifie la connexion, puis relance")
    }
  }

  const filterLabel = VIDEO_FILTERS.find((f) => f.value === props.videoFilter)?.label
  const styleLabel = SUBTITLE_STYLES.find((s) => s.value === props.subtitleStyle)?.label
  const passages = data?.batch.result?.clips ?? []

  return (
    <section aria-labelledby="lot-titre" className="space-y-6 border-t border-filet pt-8">
      <div className="space-y-1">
        <h2 id="lot-titre" className="text-2xl font-bold [font-stretch:92%]">Plusieurs clips d&apos;un coup</h2>
        <p className="max-w-[68ch] text-[15px] text-gris">
          Une série de clips de cette vidéo, avec le cadrage choisi
          {props.subtitlesEnabled ? " et les sous-titres" : ""}. Les rendus passent l&apos;un après l&apos;autre.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-5">
        <Collees label="Choix des passages" options={MODES} value={mode} onChange={setMode} />
        <Collees
          label="Nombre de clips"
          options={COUNTS.map((n) => ({ value: n, label: String(n) }))}
          value={count}
          onChange={setCount}
        />
        <Collees
          label="Durée de chaque clip"
          options={CLIP_DURATIONS.map((d, idx) => ({ value: idx, label: d.label }))}
          value={range}
          onChange={setRange}
        />
      </div>

      <div className="flex min-h-12 items-center gap-3">
        <Switch id="batch-random-look" checked={randomLook} onCheckedChange={setRandomLook} />
        <Label htmlFor="batch-random-look" className="text-base font-normal">
          Look différent pour chaque clip
          <span className="block text-[15px] text-gris">
            {randomLook
              ? "Filtre et style de sous-titres tirés au hasard pour chaque clip."
              : `Même look pour tous : ${filterLabel}${props.subtitlesEnabled ? ` · ${styleLabel}` : ""}`}
          </span>
        </Label>
      </div>

      <Button variant="outline" onClick={launch} disabled={!props.fileId || running} aria-busy={running}>
        {running && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
        Lancer {count} clips
      </Button>

      {error && (
        <p role="alert" className="max-w-[68ch] text-[15px] text-erreur">
          {error}
          <span className="block">Relance la série ; si ça recommence, vérifie que le serveur tourne.</span>
        </p>
      )}

      {data && (
        <div className="space-y-4" aria-live="polite">
          <div className="max-w-[40rem] space-y-2">
            <div className="flex items-baseline justify-between gap-4 text-[15px]">
              <span className={data.batch.status === "failed" ? "text-erreur" : "text-encre"}>
                {data.batch.status === "failed"
                  ? <>
                      {data.batch.error ?? "La série a échoué. Relance-la ou change la durée des clips."}
                      <span className="block">Relance la série ou change la durée des clips.</span>
                    </>
                  : data.batch.result
                    ? `${data.clips.length} ${PICKED_BY_LABEL[data.batch.result.picked_by]}`
                    : mode === "best"
                      ? "Écoute de la vidéo entière (la première fois, la transcription prend quelques minutes)…"
                      : "Choix des extraits sur les pauses de la voix…"}
              </span>
              <span className="chiffres shrink-0 font-semibold">{data.batch.progress} %</span>
            </div>
            <div
              role="progressbar"
              aria-label="Avancement de la série"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={data.batch.progress}
              className="h-1.5 bg-filet"
            >
              <div
                className="h-full bg-tampon transition-[width] duration-500"
                style={{ width: `${data.batch.progress}%` }}
              />
            </div>
          </div>

          {data.clips.length > 0 && (
            <div className="border border-filet bg-papier">
              <div
                aria-hidden
                className={cn("hidden gap-4 border-b border-filet px-4 py-3 text-[15px] font-semibold text-gris md:grid", COLUMNS)}
              >
                <span>N°</span>
                <span>Début – fin</span>
                <span className="text-right">Durée</span>
                <span>État</span>
                <span className="text-right">Fichier</span>
              </div>
              <ol>
                {data.clips.map((clip, idx) => {
                  const passage = passages[idx]
                  const ready = clip.status === "completed" && !!clip.output_url
                  const failed = clip.status === "failed"
                  const title = clip.label && clip.label !== `Clip ${idx + 1}` ? clip.label : null
                  return (
                    <li
                      key={clip.id}
                      className={cn("chiffres grid items-center gap-x-4 gap-y-1 border-b border-filet px-4 py-3 last:border-b-0", COLUMNS)}
                    >
                      <span className="text-base text-gris">{idx + 1}</span>
                      <span className="min-w-0">
                        <span className={cn("block text-base", ready && "font-semibold text-tampon")}>
                          {passage ? `${formatClock(passage.start_time)} – ${formatClock(passage.end_time)}` : "—"}
                        </span>
                        {title && <span className="block truncate text-[15px] text-gris">{title}</span>}
                      </span>
                      <span className="text-right text-base">
                        {passage ? formatLength(passage.end_time - passage.start_time) : "—"}
                      </span>
                      <span
                        className={cn(
                          "col-start-2 flex min-w-0 items-center gap-2 text-[15px] md:col-start-auto md:text-base",
                          failed ? "text-erreur" : ready ? "text-encre" : "text-gris"
                        )}
                      >
                        {clip.status === "processing" && <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />}
                        <span className="min-w-0 break-words">
                          {STATUS_LABEL[clip.status]}
                          {clip.status === "processing" && ` ${clip.progress} %`}
                          {failed && clip.error ? ` : ${clip.error}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "col-span-2 col-start-2 items-center gap-4 md:col-span-1 md:col-start-auto md:flex md:justify-end",
                          ready ? "flex" : "hidden"
                        )}
                      >
                        {ready ? (
                          <>
                            {clip.srt_url && (
                              <a
                                href={downloadUrl(clip.srt_url) ?? undefined}
                                download
                                className="inline-flex min-h-12 items-center text-base text-encre underline decoration-filet-fort hover:decoration-encre"
                              >
                                .srt
                              </a>
                            )}
                            <a
                              href={downloadUrl(clip.output_url) ?? undefined}
                              download={`clipflow_${idx + 1}.${props.outputFormat}`}
                              className="inline-flex min-h-12 items-center text-base font-semibold text-encre underline decoration-filet-fort hover:decoration-encre"
                            >
                              Télécharger
                            </a>
                          </>
                        ) : (
                          <span className="hidden text-base text-gris md:inline">—</span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
