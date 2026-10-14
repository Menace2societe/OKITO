"use client"

import * as React from "react"
import { Wand2, Download, CheckCircle, Loader2, Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import type { ProjectState } from "@/components/step-wizard"
import { BatchPanel } from "@/components/batch-panel"
import { SUBTITLE_STYLES, VIDEO_FILTERS } from "@/lib/presets"

const SUBTITLE_STYLE_LABELS = Object.fromEntries(
  SUBTITLE_STYLES.map((s) => [s.value, s.label])
) as Record<ProjectState["subtitleStyle"], string>

const VIDEO_FILTER_LABELS = Object.fromEntries(
  VIDEO_FILTERS.map((f) => [f.value, f.label])
) as Record<ProjectState["videoFilter"], string>

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
    fileName,
    startTime,
    endTime,
    aspectRatio,
    subtitlesEnabled,
    subtitleStyle,
    videoFilter,
    outputFormat,
    jobStatus,
    jobProgress,
    onProcess,
    onDownload,
    onNewClip,
    onFormatChange,
    transcribing,
  } = props

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Résumé du projet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Fichier: </span>
              <span className="font-medium">{fileName || "Inconnu"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Extrait: </span>
              <span className="font-medium">
                {formatTime(startTime)} - {formatTime(endTime)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Format: </span>
              <span className="font-medium">{aspectRatio}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Sous-titres: </span>
              <span className="font-medium">
                {subtitlesEnabled ? `Oui (${SUBTITLE_STYLE_LABELS[subtitleStyle]})` : "Non"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Filtre: </span>
              <span className="font-medium">{VIDEO_FILTER_LABELS[videoFilter]}</span>
            </div>
          </div>

          <div className="flex flex-col space-y-2 pt-4">
            <span className="text-sm font-medium">Format de sortie</span>
            <Select
              value={outputFormat}
              onValueChange={(val) => onFormatChange(val as "mp4" | "mp3" | "mkv")}
              disabled={jobStatus === "processing" || jobStatus === "completed"}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mp4">MP4 (Vidéo)</SelectItem>
                <SelectItem value="mkv">MKV (Vidéo)</SelectItem>
                <SelectItem value="mp3">MP3 (Audio)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {jobStatus === "idle" && (
        <div className="space-y-2">
          <Button
            size="lg"
            className="w-full text-lg h-14"
            onClick={() => onProcess()}
            disabled={transcribing}
          >
            {transcribing ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-5 w-5" />
            )}
            {transcribing ? "Transcription des paroles en cours…" : "Traiter & Télécharger"}
          </Button>
          {transcribing && (
            <p className="text-center text-sm text-muted-foreground">
              Le rendu attend la fin de la transcription pour utiliser vos paroles
              (vous pourrez encore les corriger à l&apos;étape Subtitles).
            </p>
          )}
        </div>
      )}

      {jobStatus === "processing" && (
        <Card className="p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">Traitement en cours...</span>
              <span className="text-sm text-muted-foreground">{jobProgress}%</span>
            </div>
            <Progress value={jobProgress} />
          </div>
        </Card>
      )}

      {jobStatus === "completed" && (
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full text-lg h-14 bg-green-600 hover:bg-green-700 text-white"
            onClick={onDownload}
          >
            <CheckCircle className="mr-2 h-5 w-5" />
            Télécharger le fichier
          </Button>
          {(props.vttUrl || props.srtUrl) && (
            <div className="flex items-center justify-center gap-4 text-sm">
              <span className="text-muted-foreground">Sous-titres :</span>
              {props.srtUrl && (
                <a
                  href={props.srtUrl}
                  download
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  .srt
                </a>
              )}
              {props.vttUrl && (
                <a
                  href={props.vttUrl}
                  download
                  className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  .vtt
                </a>
              )}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={onNewClip}>
            <Dices className="mr-2 h-4 w-4" />
            Créer un autre clip de cette vidéo
          </Button>
        </div>
      )}

      {jobStatus === "error" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-destructive/15 p-4 text-destructive border border-destructive/50 space-y-2">
            <p className="font-medium">Erreur lors du traitement</p>
            <pre className="text-xs whitespace-pre-wrap break-all opacity-90">
              {props.errorMessage || "Erreur inconnue"}
            </pre>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onProcess()}
          >
            Réessayer
          </Button>
        </div>
      )}

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
  )
}
