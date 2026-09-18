"use client"

import * as React from "react"
import { Smartphone, Square, Monitor } from "lucide-react"
import { DualRangeSlider } from "@/components/ui/dual-range-slider"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"

interface TrimStepProps {
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: AspectRatio;
  videoFilter: VideoFilter;
  onTrimChange: (start: number, end: number) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onVideoFilterChange: (filter: VideoFilter) => void;
}

const VIDEO_FILTERS: { value: VideoFilter; label: string; description: string }[] = [
  {
    value: "cinema_intense",
    label: "Cinéma Intense",
    description: "Contraste marqué, teintes teal & orange",
  },
  {
    value: "vibrant_social",
    label: "Vibrant Social",
    description: "Couleurs saturées, idéal réseaux sociaux",
  },
  {
    value: "bw_deep",
    label: "Noir & Blanc Profond",
    description: "Monochrome contrasté",
  },
  {
    value: "none",
    label: "Aucun Filtre",
    description: "Conserver le rendu d'origine",
  },
]

export function TrimStep({
  fileUrl,
  duration,
  startTime,
  endTime,
  aspectRatio,
  videoFilter,
  onTrimChange,
  onAspectRatioChange,
  onVideoFilterChange,
}: TrimStepProps) {
  const playerRef = React.useRef<PreviewPlayerHandle>(null)
  const [currentTime, setCurrentTime] = React.useState(startTime)

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-8">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <PreviewPlayer
          ref={playerRef}
          src={fileUrl}
          selectedFilter={videoFilter}
          aspectRatio={aspectRatio}
          startTime={startTime}
          endTime={endTime}
          onTimeUpdate={setCurrentTime}
          onLoadedDuration={(realDuration) => {
            // Sync real duration from the video file
            if (realDuration > 0 && Math.abs(realDuration - duration) > 1) {
              onTrimChange(startTime, realDuration)
            }
          }}
          caption={
            <p className="text-center text-xs text-muted-foreground">
              Aperçu du cadrage {aspectRatio} et du filtre appliqué
            </p>
          }
        />
      </div>

      <div className="space-y-4">
        <div className="flex justify-between font-mono text-sm">
          <span>{formatTime(startTime)}</span>
          <span className="text-primary">{formatTime(currentTime)}</span>
          <span>{formatTime(endTime)}</span>
        </div>
        <DualRangeSlider
          min={0}
          max={duration}
          step={1}
          value={[startTime, endTime]}
          onValueChange={(val) => {
            onTrimChange(val[0], val[1])
            playerRef.current?.seek(val[0])
            setCurrentTime(val[0])
          }}
        />
      </div>

      <div className="space-y-4">
        <h3 className="font-semibold">Format</h3>
        <div className="grid grid-cols-3 gap-4">
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "9:16" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("9:16")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Smartphone className="h-8 w-8" />
              <div className="text-sm font-medium">TikTok / Reels</div>
              <div className="text-xs text-muted-foreground">9:16</div>
            </div>
          </Card>
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "1:1" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("1:1")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Square className="h-8 w-8" />
              <div className="text-sm font-medium">Instagram</div>
              <div className="text-xs text-muted-foreground">1:1</div>
            </div>
          </Card>
          <Card
            className={cn(
              "cursor-pointer p-4 transition-colors hover:bg-accent",
              aspectRatio === "16:9" && "border-primary bg-primary/5"
            )}
            onClick={() => onAspectRatioChange("16:9")}
          >
            <div className="flex flex-col items-center space-y-2 text-center">
              <Monitor className="h-8 w-8" />
              <div className="text-sm font-medium">YouTube</div>
              <div className="text-xs text-muted-foreground">16:9</div>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Filtre vidéo</h3>
        <Select
          value={videoFilter}
          onValueChange={(val) => onVideoFilterChange(val as VideoFilter)}
        >
          <SelectTrigger className="w-full max-w-sm">
            <SelectValue placeholder="Choisir un filtre" />
          </SelectTrigger>
          <SelectContent>
            {VIDEO_FILTERS.map((filter) => (
              <SelectItem key={filter.value} value={filter.value}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          {VIDEO_FILTERS.find((f) => f.value === videoFilter)?.description}
        </p>
      </div>
    </div>
  )
}
