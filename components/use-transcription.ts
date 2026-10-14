"use client"

import * as React from "react"
import { pollJob, postJson } from "@/lib/jobs"
import type { TranscriptWord, WhisperQuality } from "@/lib/presets"

export interface TranscriptionParams {
  fileId: string | null
  videoPath: string | null
  startTime: number
  endTime: number
  quality: WhisperQuality
  vocabulary: string
  isolateVocals: boolean
}

export interface TranscriptionResult {
  text: string
  words: TranscriptWord[]
}

export interface TranscriptionState {
  status: "idle" | "running" | "error"
  error: string | null
  /** Date.now() when the running job started, for an elapsed counter. */
  startedAt: number | null
}

interface TranscribeJob {
  status: "queued" | "processing" | "completed" | "failed"
  error: string | null
  result: TranscriptionResult | null
}

/**
 * Owns the Whisper transcription job at the wizard level, so it keeps
 * running — and its result is kept — when the user leaves the Subtitles
 * step. The job itself runs on the backend and is polled.
 */
export function useTranscription(
  onResult: (result: TranscriptionResult, params: TranscriptionParams) => void
) {
  const [state, setState] = React.useState<TranscriptionState>({
    status: "idle",
    error: null,
    startedAt: null,
  })
  const stopPolling = React.useRef<(() => void) | null>(null)
  const onResultRef = React.useRef(onResult)
  onResultRef.current = onResult

  React.useEffect(() => () => stopPolling.current?.(), [])

  const cancel = React.useCallback(() => {
    stopPolling.current?.()
    stopPolling.current = null
    setState({ status: "idle", error: null, startedAt: null })
  }, [])

  const start = React.useCallback(async (params: TranscriptionParams) => {
    if (!params.fileId && !params.videoPath) return
    stopPolling.current?.()
    setState({ status: "running", error: null, startedAt: Date.now() })

    const fail = (error: string) => setState({ status: "error", error, startedAt: null })
    const startTime = Number(params.startTime) || 0
    const endTime = Number(params.endTime) > startTime ? Number(params.endTime) : startTime + 30

    try {
      const { job_id } = await postJson<{ job_id: string }>("/api/transcribe/start", {
        file_id: params.fileId || "",
        video_path: params.videoPath || "",
        start_time: startTime,
        end_time: endTime,
        quality: params.quality,
        vocabulary: params.vocabulary || null,
        isolate_vocals: params.isolateVocals,
      })
      stopPolling.current = pollJob<TranscribeJob>(
        `/api/status/${job_id}`,
        (job) => {
          if (job.status === "completed" && job.result) {
            setState({ status: "idle", error: null, startedAt: null })
            onResultRef.current(job.result, params)
          } else if (job.status === "failed") {
            fail(job.error || "Erreur lors de la génération des sous-titres.")
          }
        },
        (job) => job.status === "completed" || job.status === "failed",
        fail
      )
    } catch (e) {
      fail(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }, [])

  return { ...state, start, cancel }
}
