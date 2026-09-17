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

interface ProjectState {
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  subtitlesEnabled: boolean;
  subtitleStyle: "bold_tiktok" | "neon_yellow" | "minimal_clean";
  videoFilter: "cinema_intense" | "vibrant_social" | "bw_deep" | "none";
  outputFormat: "mp4" | "mp3" | "mkv";
  jobId: string | null;
  jobStatus: "idle" | "processing" | "completed" | "error";
  jobProgress: number;
  outputUrl: string | null;
  errorMessage: string | null;
}

const STEPS = [
  { id: 0, label: "Import", icon: Upload },
  { id: 1, label: "Trim", icon: Scissors },
  { id: 2, label: "Subtitles", icon: Subtitles },
  { id: 3, label: "Export", icon: Download },
]

export default function StepWizard() {
  const [currentStep, setCurrentStep] = React.useState(0)
  
  const [state, setState] = React.useState<ProjectState>({
    fileId: null,
    fileName: null,
    fileUrl: null,
    duration: 0,
    startTime: 0,
    endTime: 0,
    aspectRatio: "9:16",
    subtitlesEnabled: false,
    subtitleStyle: "bold_tiktok",
    videoFilter: "cinema_intense",
    outputFormat: "mp4",
    jobId: null,
    jobStatus: "idle",
    jobProgress: 0,
    outputUrl: null,
    errorMessage: null,
  })

  const updateState = (updates: Partial<ProjectState>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }

  const handleNext = () => setCurrentStep((p) => Math.min(STEPS.length - 1, p + 1))
  const handleBack = () => setCurrentStep((p) => Math.max(0, p - 1))

  const handleResetToHome = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    setCurrentStep(0)
    setState({
      fileId: null,
      fileName: null,
      fileUrl: null,
      duration: 0,
      startTime: 0,
      endTime: 0,
      aspectRatio: "9:16",
      subtitlesEnabled: false,
      subtitleStyle: "bold_tiktok",
      videoFilter: "cinema_intense",
      outputFormat: "mp4",
      jobId: null,
      jobStatus: "idle",
      jobProgress: 0,
      outputUrl: null,
      errorMessage: null,
    })
  }

  const isStepValid = () => {
    if (currentStep === 0) return !!state.fileId
    if (currentStep === 1) return state.endTime > state.startTime
    return true
  }

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleProcess = async () => {
    updateState({ jobStatus: "processing", jobProgress: 0, errorMessage: null })
    try {
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: state.fileId,
          start_time: state.startTime,
          end_time: state.endTime,
          aspect_ratio: state.aspectRatio,
          subtitles_enabled: state.subtitlesEnabled,
          style_preset: state.subtitleStyle,
          video_filter: state.videoFilter,
          output_format: state.outputFormat,
        }),
      })

      if (!res.ok) {
        let message = "Erreur lors du lancement du traitement"
        try {
          const err = await res.json()
          message = err.detail || message
        } catch { /* non-JSON response */ }
        throw new Error(message)
      }

      const data = await res.json()
      updateState({ jobId: data.job_id })

      // Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/status/${data.job_id}`)
          const statusData = await statusRes.json()
          updateState({ jobProgress: statusData.progress || 0 })

          if (statusData.status === "completed") {
            if (pollRef.current) clearInterval(pollRef.current)
            updateState({
              jobStatus: "completed",
              jobProgress: 100,
              outputUrl: statusData.output_url,
            })
          } else if (statusData.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current)
            const errMsg = statusData.error || "Erreur inconnue lors du traitement"
            console.error("[ClipFlow] Traitement échoué :", errMsg)
            updateState({ jobStatus: "error", errorMessage: errMsg })
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current)
          updateState({
            jobStatus: "error",
            errorMessage: "Connexion perdue avec le serveur",
          })
        }
      }, 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue"
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
            onFileImported={(fileId, fileName, fileUrl, duration) => {
              updateState({ 
                fileId, fileName, fileUrl, duration, 
                endTime: duration 
              })
            }}
          />
        )}
        
        {currentStep === 1 && (
          <TrimStep
            fileUrl={state.fileUrl}
            duration={state.duration}
            startTime={state.startTime}
            endTime={state.endTime}
            aspectRatio={state.aspectRatio}
            videoFilter={state.videoFilter}
            onTrimChange={(start, end) => updateState({ startTime: start, endTime: end })}
            onAspectRatioChange={(ratio) => updateState({ aspectRatio: ratio })}
            onVideoFilterChange={(filter) => updateState({ videoFilter: filter })}
          />
        )}
        
        {currentStep === 2 && (
          <SubtitleStep
            fileUrl={state.fileUrl}
            startTime={state.startTime}
            endTime={state.endTime}
            subtitlesEnabled={state.subtitlesEnabled}
            subtitleStyle={state.subtitleStyle}
            onToggle={(enabled) => updateState({ subtitlesEnabled: enabled })}
            onStyleChange={(style) => updateState({ subtitleStyle: style })}
          />
        )}

        {currentStep === 3 && (
          <ExportStep
            {...state}
            onProcess={handleProcess}
            onDownload={handleDownload}
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
