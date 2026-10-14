"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight, Upload, Scissors, Subtitles, Download, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

import { ImportStep } from "@/components/steps/import-step"
import { TrimStep } from "@/components/steps/trim-step"
import { SubtitleStep } from "@/components/steps/subtitle-step"
import { ExportStep } from "@/components/steps/export-step"
import type { AspectRatio } from "@/components/preview-player"
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
  { id: 0, label: "Import", icon: Upload },
  { id: 1, label: "Trim", icon: Scissors },
  { id: 2, label: "Subtitles", icon: Subtitles },
  { id: 3, label: "Export", icon: Download },
]

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
      const res = await fetch("/api/process", {
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
        throw new Error("Le serveur a renvoyé une réponse invalide pendant l'export.")
      }

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.detail || "Erreur lors du lancement du traitement")
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
              outputUrl: job.output_url,
              vttUrl: job.vtt_url || null,
              srtUrl: job.srt_url || null,
            })
          } else if (job.status === "failed") {
            const errMsg = job.error || "Erreur inconnue lors du traitement"
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
            : "Erreur inconnue"
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

  return (
    <Card className="w-full p-6 sm:p-8">
      {currentStep > 0 && (
        <div className="mb-4 flex items-start">
          <button
            onClick={handleResetToHome}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
            title="Revenir à l'accueil"
          >
            <Home className="h-4 w-4" />
            <span>Accueil</span>
          </button>
        </div>
      )}

      <div className="mb-8">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-300" 
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          {STEPS.map((step, idx) => {
            const Icon = step.icon
            const isActive = idx === currentStep
            const isCompleted = idx < currentStep
            
            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <div 
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
                    isActive ? "border-primary bg-background text-primary" :
                    isCompleted ? "border-primary bg-primary text-primary-foreground" :
                    "border-muted bg-background text-muted-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span 
                  className={cn(
                    "absolute -bottom-6 text-xs font-medium",
                    (isActive || isCompleted) ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mt-12 min-h-[400px]">
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
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-6">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 0}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retour
        </Button>
        <Button
          onClick={handleNext}
          disabled={!isStepValid() || currentStep === STEPS.length - 1}
        >
          Suivant
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </Card>
  )
}
