"use client"

import * as React from "react"
import { Wand2, Download, CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"

interface ProjectState {
  fileId: string | null;
  fileName: string | null;
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  subtitlesEnabled: boolean;
  subtitleStyle: "karaoke" | "classic";
  outputFormat: "mp4" | "mp3" | "mkv";
  jobId: string | null;
  jobStatus: "idle" | "processing" | "completed" | "error";
  jobProgress: number;
  outputUrl: string | null;
  errorMessage: string | null;
}

interface ExportStepProps extends ProjectState {
  onProcess: () => void;
  onDownload: () => void;
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
    outputFormat,
    jobStatus,
    jobProgress,
    onProcess,
    onDownload,
    onFormatChange,
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
                {subtitlesEnabled ? `Oui (${subtitleStyle})` : "Non"}
              </span>
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
        <Button
          size="lg"
          className="w-full text-lg h-14"
          onClick={() => onProcess()}
        >
          <Wand2 className="mr-2 h-5 w-5" />
          Traiter & Télécharger
        </Button>
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
        <Button
          size="lg"
          className="w-full text-lg h-14 bg-green-600 hover:bg-green-700 text-white"
          onClick={onDownload}
        >
          <CheckCircle className="mr-2 h-5 w-5" />
          Télécharger le fichier
        </Button>
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
    </div>
  )
}
