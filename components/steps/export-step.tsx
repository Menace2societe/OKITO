"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ProjectState } from "@/components/step-wizard"
import { BatchPanel } from "@/components/batch-panel"
import { TIRAGE_FRAME, Tampon, formatClock, formatLength } from "@/components/tirage"
import { cn } from "@/lib/utils"
import { SUBTITLE_STYLES, VIDEO_FILTERS } from "@/lib/presets"

const SUBTITLE_STYLE_LABELS = Object.fromEntries(
  SUBTITLE_STYLES.map((s) => [s.value, s.label])
) as Record<ProjectState["subtitleStyle"], string>

const VIDEO_FILTER_LABELS = Object.fromEntries(
  VIDEO_FILTERS.map((f) => [f.value, f.label])
) as Record<ProjectState["videoFilter"], string>

type OutputFormat = ProjectState["outputFormat"]

const OUTPUT_FORMATS: { value: OutputFormat; name: string; use: string }[] = [
  { value: "mp4", name: "MP4", use: "Vidéo" },
  { value: "mkv", name: "MKV", use: "Vidéo" },
  { value: "mp3", name: "MP3", use: "Son seul" },
]

const FORMAT_NAMES: Record<ProjectState["aspectRatio"], string> = {
  "9:16": "Vertical 9:16",
  "9:16_fit": "Vertical 9:16",
  "9:16_face": "Vertical 9:16",
  "1:1": "Carré 1:1",
  "16:9": "Horizontal 16:9",
}

// Same print sizes as the Trim step.
const TIRAGE_SIZES: Record<ProjectState["aspectRatio"], { width: number; height: number }> = {
  "9:16": { width: 270, height: 480 },
  "9:16_fit": { width: 270, height: 480 },
  "9:16_face": { width: 270, height: 480 },
  "1:1": { width: 420, height: 420 },
  "16:9": { width: 560, height: 315 },
}

const zoomLabel = (zoom: number) =>
  zoom === 0 ? "Vidéo entière" : zoom === 100 ? "Plein écran" : `Zoom ${zoom} %`

interface ExportStepProps extends ProjectState {
  onProcess: () => void;
  onDownload: () => void;
  onNewClip: () => void;
  /** Lyrics still being transcribed: the render waits for them. */
  transcribing: boolean;
  onFormatChange: (format: "mp4" | "mp3" | "mkv") => void;
}

export function ExportStep(props: ExportStepProps) {
  const {
    startTime,
    endTime,
    aspectRatio,
    zoom,
    subtitlesEnabled,
    subtitleStyle,
    videoFilter,
    outputFormat,
    jobStatus,
    jobProgress,
    outputUrl,
    onProcess,
    onDownload,
    onNewClip,
    onFormatChange,
    transcribing,
  } = props

  const isVertical = aspectRatio.startsWith("9:16")
  const done = jobStatus === "completed"
  const formatLocked = jobStatus === "processing" || done
  const shortFormat = isVertical ? "9:16" : aspectRatio
  const framing = isVertical
    ? aspectRatio === "9:16_face" ? "Visage suivi" : zoomLabel(zoom)
    : "—"
  const size = TIRAGE_SIZES[aspectRatio]
  const showVideo = done && !!outputUrl && outputFormat !== "mp3"

  const ficheRows: { label: string; value: React.ReactNode }[] = [
    {
      label: "Passage",
      value: (
        <span className="font-semibold text-tampon">
          {formatClock(startTime)} → {formatClock(endTime)}
        </span>
      ),
    },
    { label: "Durée", value: formatLength(endTime - startTime) },
    { label: "Format", value: FORMAT_NAMES[aspectRatio] },
    { label: "Cadrage", value: framing },
    { label: "Filtre", value: VIDEO_FILTER_LABELS[videoFilter] },
    {
      label: "Sous-titres",
      value: subtitlesEnabled ? `Oui · ${SUBTITLE_STYLE_LABELS[subtitleStyle]}` : "Non",
    },
  ]

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
        {showVideo ? (
          <div className={cn("max-w-full", TIRAGE_FRAME)}>
            <video
              src={outputUrl ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="block bg-black object-contain"
              style={{ width: size.width, aspectRatio: `${size.width} / ${size.height}`, maxWidth: "100%" }}
            />
            {/* w-0 min-w-full: the caption never widens the print past the image. */}
            <div className="flex w-0 min-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <p className="text-[15px] leading-snug text-gris">
                Clip rendu · {outputFormat.toUpperCase()}
              </p>
              <Tampon
                start={startTime}
                end={endTime}
                detail={shortFormat}
                landKey={done ? 1 : 0}
                className="ml-auto shrink-0"
              />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[24rem] border border-filet bg-papier">
            <p className="border-b border-filet px-4 py-3 text-base font-semibold">Fiche du clip</p>
            <dl className="chiffres">
              {ficheRows.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-4 border-b border-filet px-4 py-3 last:border-b-0"
                >
                  <dt className="text-[15px] text-gris">{row.label}</dt>
                  <dd className="break-words text-base">{row.value}</dd>
                </div>
              ))}
            </dl>
            {done && (
              <div className="flex justify-end border-t border-filet px-4 py-4">
                <Tampon start={startTime} end={endTime} detail={shortFormat} landKey={1} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-10">
        <section aria-labelledby="export-titre" className="space-y-6">
          <h1 id="export-titre" className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
            Exporter le clip
          </h1>

          <div className="space-y-2">
            <p id="sortie-titre" className="text-base font-semibold">Format de sortie</p>
            <div role="radiogroup" aria-labelledby="sortie-titre" className="flex w-fit max-w-full border border-filet-fort">
              {OUTPUT_FORMATS.map((format) => {
                const on = outputFormat === format.value
                return (
                  <button
                    key={format.value}
                    role="radio"
                    aria-checked={on}
                    disabled={formatLocked}
                    onClick={() => onFormatChange(format.value)}
                    className={cn(
                      "min-h-12 border-r border-filet px-4 py-2 text-left last:border-r-0 disabled:cursor-not-allowed",
                      on ? "bg-encre text-white" : "bg-papier hover:bg-accent disabled:text-gris disabled:hover:bg-papier"
                    )}
                  >
                    <span className="block text-base font-semibold">{format.name}</span>
                    <span className={cn("block text-[15px]", on ? "text-white/80" : "text-gris")}>{format.use}</span>
                  </button>
                )
              })}
            </div>
            {formatLocked && (
              <p className="text-[15px] text-gris">
                Le format est fixé pour ce rendu. Lance un nouveau clip pour en changer.
              </p>
            )}
          </div>

          <div className="space-y-4" aria-live="polite">
            {jobStatus === "idle" && (
              <>
                <Button size="lg" onClick={() => onProcess()} disabled={transcribing} aria-busy={transcribing}>
                  {transcribing && <Loader2 aria-hidden className="h-5 w-5 animate-spin" />}
                  {transcribing ? "Transcription des paroles en cours…" : "Lancer le rendu"}
                </Button>
                {transcribing && (
                  <p className="max-w-[68ch] text-[15px] text-gris">
                    Le rendu attend la fin de la transcription pour utiliser tes paroles. Tu pourras
                    encore les corriger à l&apos;étape Sous-titrer.
                  </p>
                )}
              </>
            )}

            {jobStatus === "processing" && (
              <div className="max-w-[40rem] space-y-2">
                <Button size="lg" disabled aria-busy>
                  <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
                  Rendu en cours
                </Button>
                <div className="flex items-baseline justify-between gap-4 pt-2">
                  <span className="text-base">Rendu du clip</span>
                  <span className="chiffres text-base font-semibold">{jobProgress} %</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Rendu du clip"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={jobProgress}
                  className="h-1.5 bg-filet"
                >
                  <div
                    className="h-full bg-tampon transition-[width] duration-500"
                    style={{ width: `${jobProgress}%` }}
                  />
                </div>
                <p className="max-w-[68ch] text-[15px] text-gris">
                  Le rendu continue sur le serveur même si la connexion coupe un instant : la page
                  reprend le suivi toute seule.
                </p>
              </div>
            )}

            {done && (
              <>
                <Button size="lg" onClick={onDownload}>
                  Télécharger le clip
                </Button>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <Button variant="outline" onClick={onNewClip}>
                    Nouveau clip de la même vidéo
                  </Button>
                  {(props.srtUrl || props.vttUrl) && (
                    <p className="flex items-center gap-4 text-base">
                      <span className="text-gris">Sous-titres seuls :</span>
                      {props.srtUrl && (
                        <a
                          href={props.srtUrl}
                          download
                          className="inline-flex min-h-12 items-center font-semibold text-encre underline decoration-filet-fort hover:decoration-encre"
                        >
                          .srt
                        </a>
                      )}
                      {props.vttUrl && (
                        <a
                          href={props.vttUrl}
                          download
                          className="inline-flex min-h-12 items-center font-semibold text-encre underline decoration-filet-fort hover:decoration-encre"
                        >
                          .vtt
                        </a>
                      )}
                    </p>
                  )}
                </div>
              </>
            )}

            {jobStatus === "error" && (
              <>
                <div role="alert" className="max-w-[68ch] space-y-1 text-erreur">
                  <p className="text-base font-semibold">Le rendu a échoué.</p>
                  <p className="whitespace-pre-wrap break-words text-[15px]">
                    {props.errorMessage || "Le serveur n'a pas donné de raison."}
                  </p>
                  <p className="text-[15px]">
                    Relance le rendu ; si ça recommence, raccourcis le passage.
                  </p>
                </div>
                <Button size="lg" onClick={() => onProcess()}>
                  Relancer le rendu
                </Button>
              </>
            )}
          </div>
        </section>

        {outputFormat !== "mp3" && (
          <BatchPanel
            fileId={props.fileId}
            aspectRatio={aspectRatio}
            zoom={props.zoom}
            whisperQuality={props.whisperQuality}
            vocabulary={props.vocabulary}
            isolateVocals={props.isolateVocals}
            subtitlesEnabled={subtitlesEnabled}
            subtitleStyle={subtitleStyle}
            videoFilter={videoFilter}
            outputFormat={outputFormat}
          />
        )}
      </div>
    </div>
  )
}
