"use client"

import * as React from "react"
import { Play, Pause, Smartphone, Square, Monitor } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DualRangeSlider } from "@/components/ui/dual-range-slider"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface TrimStepProps {
  fileUrl: string | null;
  duration: number;
  startTime: number;
  endTime: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  onTrimChange: (start: number, end: number) => void;
  onAspectRatioChange: (ratio: "9:16" | "1:1" | "16:9") => void;
}

export function TrimStep({
  fileUrl,
  duration,
  startTime,
  endTime,
  aspectRatio,
  onTrimChange,
  onAspectRatioChange,
}: TrimStepProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(startTime)

  React.useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
      if (video.currentTime >= endTime) {
        video.pause()
        video.currentTime = startTime
        setIsPlaying(false)
      }
    }

    video.addEventListener("timeupdate", handleTimeUpdate)
    return () => video.removeEventListener("timeupdate", handleTimeUpdate)
  }, [startTime, endTime])

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        if (videoRef.current.currentTime >= endTime) {
          videoRef.current.currentTime = startTime
        }
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
  }

  return (
    <div className="space-y-8">
      <div className="w-full max-w-2xl mx-auto space-y-4">
        <div className="rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
          {fileUrl ? (
            <video
              ref={videoRef}
              src={fileUrl}
              controls
              preload="metadata"
              crossOrigin="anonymous"
              className="w-full h-full object-contain"
              onLoadedMetadata={() => {
                if (videoRef.current && videoRef.current.duration) {
                  // Sync real duration from the video file
                  const realDuration = videoRef.current.duration
                  if (realDuration > 0 && Math.abs(realDuration - duration) > 1) {
                    onTrimChange(startTime, realDuration)
                  }
                }
              }}
              onClick={togglePlay}
            />
          ) : (
            <p className="text-white text-sm">Aucune vidéo à prévisualiser</p>
          )}
        </div>
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={togglePlay}>
            {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {isPlaying ? "Pause" : "Lire la sélection"}
          </Button>
        </div>
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
            if (videoRef.current) {
              videoRef.current.currentTime = val[0]
              setCurrentTime(val[0])
            }
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
    </div>
  )
}
