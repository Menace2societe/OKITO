"use client"

import * as React from "react"
import { Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AspectRatio = "9:16" | "1:1" | "16:9"
export type VideoFilter = "cinema_intense" | "vibrant_social" | "bw_deep" | "none"

// CSS approximations of the FFmpeg filter chains, applied instantly (0 ms)
// on the <video> element so the preview matches the final render.
export const FILTER_STYLES: Record<string, React.CSSProperties> = {
  none: {},
  // ClipFlow backend filters
  cinema_intense: { filter: "contrast(125%) saturate(135%) brightness(98%)" },
  vibrant_social: { filter: "contrast(115%) saturate(140%)" },
  bw_deep: { filter: "grayscale(100%) contrast(130%) brightness(97%)" },
  // Generic aliases (kept for compatibility with external filter sets)
  black_white: { filter: "grayscale(100%) contrast(110%)" },
  cinema: { filter: "contrast(115%) saturate(120%) brightness(95%)" },
  vintage: { filter: "sepia(50%) contrast(100%) brightness(90%) hue-rotate(-10deg)" },
  warm: { filter: "sepia(25%) saturate(130%) brightness(105%)" },
  cool: { filter: "hue-rotate(30deg) saturate(110%) brightness(95%)" },
  vhs: { filter: "contrast(130%) saturate(140%) hue-rotate(-15deg)" },
}

const PREVIEW_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 236, height: 420 },
  "1:1": { width: 380, height: 380 },
  "16:9": { width: 640, height: 360 },
}

export interface PreviewPlayerHandle {
  seek: (time: number) => void
  play: () => void
  pause: () => void
  getElement: () => HTMLVideoElement | null
}

interface PreviewPlayerProps {
  src: string | null
  selectedFilter: string
  aspectRatio?: AspectRatio
  startTime?: number
  endTime?: number
  onTimeUpdate?: (time: number) => void
  onLoadedDuration?: (duration: number) => void
  showControls?: boolean
  showPlayButton?: boolean
  caption?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

export const PreviewPlayer = React.forwardRef<PreviewPlayerHandle, PreviewPlayerProps>(
  function PreviewPlayer(
    {
      src,
      selectedFilter,
      aspectRatio = "9:16",
      startTime = 0,
      endTime,
      onTimeUpdate,
      onLoadedDuration,
      showControls = true,
      showPlayButton = true,
      caption,
      className,
      children,
    },
    ref
  ) {
    const videoRef = React.useRef<HTMLVideoElement>(null)
    const [isPlaying, setIsPlaying] = React.useState(false)

    const seek = React.useCallback(
      (time: number) => {
        const video = videoRef.current
        if (!video) return
        video.currentTime = time
        onTimeUpdate?.(time)
      },
      [onTimeUpdate]
    )

    const play = React.useCallback(() => {
      const video = videoRef.current
      if (!video) return
      if (endTime !== undefined && video.currentTime >= endTime) {
        video.currentTime = startTime
      }
      void video.play()
      setIsPlaying(true)
    }, [startTime, endTime])

    const pause = React.useCallback(() => {
      videoRef.current?.pause()
      setIsPlaying(false)
    }, [])

    React.useImperativeHandle(
      ref,
      () => ({ seek, play, pause, getElement: () => videoRef.current }),
      [seek, play, pause]
    )

    const togglePlay = () => {
      if (isPlaying) pause()
      else play()
    }

    React.useEffect(() => {
      const video = videoRef.current
      if (!video) return

      const handleTimeUpdate = () => {
        onTimeUpdate?.(video.currentTime)
        if (endTime !== undefined && video.currentTime >= endTime) {
          video.pause()
          video.currentTime = startTime
          setIsPlaying(false)
        }
      }

      video.addEventListener("timeupdate", handleTimeUpdate)
      return () => video.removeEventListener("timeupdate", handleTimeUpdate)
    }, [startTime, endTime, onTimeUpdate])

    const size = PREVIEW_SIZES[aspectRatio]

    return (
      <div className={cn("flex flex-col items-center gap-3", className)}>
        <div
          className="relative overflow-hidden rounded-lg bg-black"
          style={{ width: size.width, height: size.height, maxWidth: "100%" }}
        >
          {src ? (
            <video
              ref={videoRef}
              src={src}
              controls={showControls}
              preload="metadata"
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
              style={FILTER_STYLES[selectedFilter] ?? {}}
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (!video) return
                video.currentTime = startTime
                if (video.duration && onLoadedDuration) {
                  onLoadedDuration(video.duration)
                }
              }}
              onClick={togglePlay}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <p className="text-white text-sm text-center px-4">
                Aucune vidéo à prévisualiser
              </p>
            </div>
          )}

          {children}
        </div>

        {caption}

        {showPlayButton && (
          <Button variant="outline" size="sm" onClick={togglePlay}>
            {isPlaying ? (
              <Pause className="mr-2 h-4 w-4" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {isPlaying ? "Pause" : "Lire la sélection"}
          </Button>
        )}
      </div>
    )
  }
)
