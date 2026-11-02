"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatClock } from "@/components/tirage"
import { usePcStatus } from "@/components/use-pc-status"

import { ImportStep } from "@/components/steps/import-step"
import { TrimStep } from "@/components/steps/trim-step"
import { SubtitleStep } from "@/components/steps/subtitle-step"
import { ExportStep } from "@/components/steps/export-step"
import type { AspectRatio } from "@/components/preview-player"
import { apiFetch, downloadUrl } from "@/lib/backend"
import { pollJob } from "@/lib/jobs"
import { useTranscription, type TranscriptionParams } from "@/components/use-transcription"
import { linesFromWords } from "@/lib/subtitles"
import {
  SUBTITLE_STYLES,
  VIDEO_FILTERS,
  pickRandom,
  type Moment,
  type SubtitleStyle,
  type TranscriptWord,
  type VideoFilter,
  type WhisperQuality,
} from "@/lib/presets"

interface RenderJob {
  status: "queued" | "processing" | "completed" | "failed"
  progress: number
  output_url: string | null
  vtt_url: string | null
  srt_url: string | null
  error: string | null
}

// Per-viewer preferences kept between sessions (best effort).
const PREFS_KEY = "clipflow:transcription"

export interface ProjectState {
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  videoPath: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  zoom: number;
  whisperQuality: WhisperQuality;
  vocabulary: string;
  isolateVocals: boolean;
  subtitlesEnabled: boolean;
  subtitleStyle: SubtitleStyle;
  customSubtitles: string;
  transcriptWords: TranscriptWord[] | null;
  videoFilter: VideoFilter;
  outputFormat: "mp4" | "mp3" | "mkv";
  jobId: string | null;
  jobStatus: "idle" | "processing" | "completed" | "error";
  jobProgress: number;
  outputUrl: string | null;
  vttUrl: string | null;
  srtUrl: string | null;
  errorMessage: string | null;
}

const STEPS = [
  { id: 0, label: "Importer", next: "découper", back: null },
  { id: 1, label: "Découper", next: "sous-titrer", back: "Retour à l'import" },
  { id: 2, label: "Sous-titrer", next: "exporter", back: "Retour au découpage" },
  { id: 3, label: "Exporter", next: null, back: "Retour aux sous-titres" },
]

const PC_LABELS = {
  online: "PC relais allumé",
  checking: "Vérification du PC…",
  offline: "PC relais éteint",
} as const

const PROCESS_TIMEOUT_MS = 5 * 60 * 1000

const JOB_RESET: Pick<
  ProjectState,
  "jobId" | "jobStatus" | "jobProgress" | "outputUrl" | "vttUrl" | "srtUrl" | "errorMessage"
> = {
  jobId: null,
  jobStatus: "idle",
  jobProgress: 0,
  outputUrl: null,
  vttUrl: null,
  srtUrl: null,
  errorMessage: null,
}

const INITIAL_STATE: ProjectState = {
  fileId: null,
  fileName: null,
  fileUrl: null,
  videoPath: null,
  duration: 0,
  startTime: 0,
  endTime: 0,
  aspectRatio: "9:16_fit",
  zoom: 0,
  whisperQuality: "accurate",
  vocabulary: "",
  isolateVocals: true,
  subtitlesEnabled: false,
  subtitleStyle: "bold_tiktok",
  customSubtitles: "",
  transcriptWords: null,
  videoFilter: "cinema_intense",
  outputFormat: "mp4",
  ...JOB_RESET,
}

export default function StepWizard() {
  const [currentStep, setCurrentStep] = React.useState(0)
  const pcStatus = usePcStatus()

  const [state, setState] = React.useState<ProjectState>(INITIAL_STATE)

  const updateState = (updates: Partial<ProjectState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }

  // Whisper job owned here so it survives step changes. A result is applied
  // only if it still matches the current file and trim.
  const transcription = useTranscription((result, params: TranscriptionParams) => {
    setState((prev) => {
      if (
        params.fileId !== prev.fileId ||
        params.startTime !== prev.startTime ||
        params.endTime !== prev.endTime ||
        prev.customSubtitles.trim()
      ) {
        return prev
      }
      return {
        ...prev,
        customSubtitles: Array.isArray(result.words) && result.words.length
          ? linesFromWords(result.words)
          : result.text || "",
        transcriptWords: Array.isArray(result.words) ? result.words : null,
      }
    })
  })

  const startTranscription = () =>
    transcription.start({
      fileId: state.fileId,
      videoPath: state.videoPath,
      startTime: state.startTime,
      endTime: state.endTime,
      quality: state.whisperQuality,
      vocabulary: state.vocabulary,
      isolateVocals: state.isolateVocals,
    })

  // Vocabulary and quality are the same from one video to the next.
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}")
      updateState({
        vocabulary: typeof saved.vocabulary === "string" ? saved.vocabulary : "",
        whisperQuality: saved.whisperQuality === "fast" ? "fast" : "accurate",
        isolateVocals: saved.isolateVocals !== false,
      })
    } catch {
      // Storage unavailable: keep defaults.
    }
  }, [])

  React.useEffect(() => {
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          vocabulary: state.vocabulary,
          whisperQuality: state.whisperQuality,
          isolateVocals: state.isolateVocals,
        })
      )
    } catch {
      // Storage unavailable: preferences just won't persist.
    }
  }, [state.vocabulary, state.whisperQuality, state.isolateVocals])

  const handleNext = () => setCurrentStep((p) => Math.min(STEPS.length - 1, p + 1))
  const handleBack = () => setCurrentStep((p) => Math.max(0, p - 1))

  const handleResetToHome = () => {
    pollRef.current?.()
    setCurrentStep(0)
    setState((prev) => ({
      ...INITIAL_STATE,
      vocabulary: prev.vocabulary,
      whisperQuality: prev.whisperQuality,
      isolateVocals: prev.isolateVocals,
    }))
  }

  // Keep the file, clear the finished job and go back to Trim for another clip.
  const handleNewClip = () => {
    pollRef.current?.()
    updateState(JOB_RESET)
    setCurrentStep(1)
  }

  const handleTrimChange = (start: number, end: number) => {
    setState((prev) => {
      const changed = start !== prev.startTime || end !== prev.endTime
      // A Whisper transcript belongs to the old segment: drop it so the
      // Subtitles step re-transcribes. Pasted lyrics (no transcript) are kept.
      const staleTranscript = changed && prev.transcriptWords !== null
      return {
        ...prev,
        startTime: start,
        endTime: end,
        ...(staleTranscript ? { customSubtitles: "", transcriptWords: null } : {}),
      }
    })
  }

  // A best moment already has its Whisper words: reuse them as subtitles
  // instead of transcribing the segment again.
  const handleSelectMoment = (moment: Moment) => {
    updateState({
      startTime: moment.start_time,
      endTime: moment.end_time,
      customSubtitles: moment.words.length ? linesFromWords(moment.words) : moment.text,
      transcriptWords: moment.words.length ? moment.words : null,
    })
  }

  const handleRandomLook = () => {
    setState((prev) => ({
      ...prev,
      videoFilter: pickRandom(VIDEO_FILTERS.map((f) => f.value), prev.videoFilter),
      subtitleStyle: pickRandom(SUBTITLE_STYLES.map((s) => s.value), prev.subtitleStyle),
    }))
  }

  const isStepValid = () => {
    if (currentStep === 0) return !!state.fileId
    if (currentStep === 1) return state.endTime > state.startTime
    return true
  }

  const pollRef = React.useRef<(() => void) | null>(null)

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      pollRef.current?.()
    }
  }, [])

  const handleProcess = async () => {
    pollRef.current?.()
    updateState({ jobStatus: "processing", jobProgress: 0, errorMessage: null })
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, PROCESS_TIMEOUT_MS)

    try {
      const res = await apiFetch("/api/process", {
        method: "POST",
        signal: controller.signal,
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: state.fileId,
          start_time: state.startTime,
          end_time: state.endTime,
          aspect_ratio: state.aspectRatio,
          subtitles_enabled: state.subtitlesEnabled,
          style_preset: state.subtitleStyle,
          custom_subtitles: state.customSubtitles.trim() ? state.customSubtitles : null,
          reference_words: state.customSubtitles.trim() ? state.transcriptWords : null,
          video_filter: state.videoFilter,
          zoom: state.aspectRatio.startsWith("9:16") ? state.zoom : null,
          quality: state.whisperQuality,
          vocabulary: state.vocabulary || null,
          isolate_vocals: state.isolateVocals,
          output_format: state.outputFormat,
        }),
      })
      window.clearTimeout(timeoutId)

      const contentType = res.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const rawText = await res.text()
        console.error("[ClipFlow Export] Réponse brute non-JSON :", rawText)
        throw new Error("Le serveur a renvoyé une réponse illisible pendant l'export. Attends une minute, puis relance le rendu.")
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Le serveur n'a pas pu lancer le rendu. Vérifie qu'il tourne, puis relance.")
      }

      updateState({ jobId: data.job_id })

      // Poll for status (tolerates network blips, e.g. a phone waking up)
      pollRef.current = pollJob<RenderJob>(
        `/api/status/${data.job_id}`,
        (job) => {
          if (job.status === "completed") {
            updateState({
              jobStatus: "completed",
              jobProgress: 100,
              outputUrl: downloadUrl(job.output_url),
              vttUrl: downloadUrl(job.vtt_url),
              srtUrl: downloadUrl(job.srt_url),
            })
          } else if (job.status === "failed") {
            const errMsg = job.error || "Le rendu s'est arrêté sans donner de raison. Relance-le ; si ça recommence, raccourcis le passage."
            console.error("[ClipFlow] Traitement échoué :", errMsg)
            updateState({ jobStatus: "error", errorMessage: errMsg })
          } else {
            updateState({ jobProgress: job.progress || 0 })
          }
        },
        (job) => job.status === "completed" || job.status === "failed",
        (message) => updateState({ jobStatus: "error", errorMessage: message })
      )
    } catch (e) {
      window.clearTimeout(timeoutId)
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "Le traitement FFmpeg a dépassé le délai imparti."
          : e instanceof Error
            ? e.message
            : "Le rendu n'a pas pu démarrer. Vérifie la connexion, puis relance."
      updateState({ jobStatus: "error", errorMessage: msg })
    }
  }

  const handleDownload = () => {
    if (state.outputUrl) {
      const a = document.createElement("a")
      a.href = state.outputUrl
      a.download = `clipflow_output.${state.outputFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const step = STEPS[currentStep]

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-toile text-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-10 gap-y-3 px-4 py-4 sm:px-10 lg:min-h-24">
          <p className="text-2xl font-extrabold tracking-[-0.01em] [font-stretch:112%]">ClipFlow</p>

          <nav aria-label="Étapes" className="order-last w-full lg:order-none lg:w-auto">
            <ol className="flex items-baseline gap-9">
              {STEPS.map((s, idx) => (
                <li
                  key={s.id}
                  aria-current={idx === currentStep ? "step" : undefined}
                  className={cn(
                    "text-[30px] leading-tight [font-stretch:88%]",
                    idx === currentStep
                      ? "border-b-[3px] border-white pb-1 font-extrabold text-white"
                      : cn("hidden font-medium lg:block", idx < currentStep ? "text-white/85" : "text-white/65")
                  )}
                >
                  {s.label}
                  {idx === currentStep && (
                    <span className="ml-3 text-[15px] font-normal text-white/80 [font-stretch:100%] lg:hidden">
                      étape {idx + 1} sur {STEPS.length}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 text-[15px]">
            {pcStatus !== "local" && (
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    pcStatus === "online" ? "bg-[#7FD69B]" : pcStatus === "checking" ? "bg-white/50" : "bg-[#F2A49C]"
                  )}
                />
                {PC_LABELS[pcStatus]}
              </span>
            )}
            {state.fileName && (
              <span className="chiffres max-w-[22rem] truncate text-white/85 sm:border-l sm:border-white/30 sm:pl-5 lg:hidden min-[1400px]:inline">
                {state.fileName}
                {state.duration > 0 && ` · ${formatClock(state.duration)}`}
              </span>
            )}
            {currentStep > 0 && (
              <button
                onClick={handleResetToHome}
                className="min-h-12 text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
              >
                Nouvelle vidéo
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-8 sm:px-10 sm:py-9">
        {currentStep === 0 && (
          <ImportStep
            onFileImported={(fileId, fileName, fileUrl, duration, videoPath) => {
              updateState({
                fileId, fileName, fileUrl, duration, videoPath,
                startTime: 0,
                endTime: duration,
                customSubtitles: "",
                transcriptWords: null,
              })
            }}
          />
        )}
        
        {currentStep === 1 && (
          <TrimStep
            fileId={state.fileId}
            fileUrl={state.fileUrl}
            duration={state.duration}
            startTime={state.startTime}
            endTime={state.endTime}
            aspectRatio={state.aspectRatio}
            zoom={state.zoom}
            whisperQuality={state.whisperQuality}
            vocabulary={state.vocabulary}
            isolateVocals={state.isolateVocals}
            videoFilter={state.videoFilter}
            onZoomChange={(zoom) => updateState({ zoom })}
            onTrimChange={handleTrimChange}
            onAspectRatioChange={(ratio) => updateState({ aspectRatio: ratio })}
            onVideoFilterChange={(filter) => updateState({ videoFilter: filter })}
            onRandomLook={handleRandomLook}
            onSelectMoment={handleSelectMoment}
          />
        )}
        
        {currentStep === 2 && (
          <SubtitleStep
            fileId={state.fileId}
            videoPath={state.videoPath}
            fileUrl={state.fileUrl}
            startTime={state.startTime}
            endTime={state.endTime}
            subtitlesEnabled={state.subtitlesEnabled}
            subtitleStyle={state.subtitleStyle}
            videoFilter={state.videoFilter}
            aspectRatio={state.aspectRatio}
            zoom={state.zoom}
            whisperQuality={state.whisperQuality}
            vocabulary={state.vocabulary}
            onWhisperQualityChange={(whisperQuality) => updateState({ whisperQuality })}
            onVocabularyChange={(vocabulary) => updateState({ vocabulary })}
            isolateVocals={state.isolateVocals}
            onIsolateVocalsChange={(isolateVocals) => updateState({ isolateVocals })}
            transcriptWords={state.transcriptWords}
            customSubtitles={state.customSubtitles}
            onToggle={(enabled) => updateState({ subtitlesEnabled: enabled })}
            onStyleChange={(style) => updateState({ subtitleStyle: style })}
            onCustomSubtitlesChange={(text) => updateState({ customSubtitles: text })}
            transcription={transcription}
            onTranscribe={() => {
              // A fresh transcription replaces the current text.
              updateState({ customSubtitles: "", transcriptWords: null })
              void startTranscription()
            }}
          />
        )}

        {currentStep === 3 && (
          <ExportStep
            {...state}
            onProcess={handleProcess}
            onDownload={handleDownload}
            onNewClip={handleNewClip}
            transcribing={state.subtitlesEnabled && transcription.status === "running"}
            onFormatChange={(format) => updateState({ outputFormat: format })}
          />
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-filet bg-papier">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-4 sm:px-10 lg:min-h-[88px]">
          {step.back ? (
            <button
              onClick={handleBack}
              className="flex min-h-12 items-center gap-2 text-base text-encre underline decoration-filet-fort underline-offset-4 hover:decoration-encre"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              <span className="sm:hidden">Retour</span>
              <span className="hidden sm:inline">{step.back}</span>
            </button>
          ) : (
            <span />
          )}
          {step.next && (
            <Button size="lg" onClick={handleNext} disabled={!isStepValid()}>
              Suivant : {step.next}
              <ArrowRight aria-hidden className="h-5 w-5" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
