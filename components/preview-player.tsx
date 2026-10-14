"use client"

import * as React from "react"
import { Play, Pause } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AspectRatio = "9:16" | "9:16_fit" | "9:16_face" | "1:1" | "16:9"
export type { VideoFilter } from "@/lib/presets"

// CSS approximations of the FFmpeg filter chains, applied instantly (0 ms)
// on the <video> element so the preview matches the final render.
export const FILTER_STYLES: Record<string, React.CSSProperties> = {
  none: {},
  // ClipFlow backend filters
  cinema_intense: { filter: "contrast(120%) saturate(125%) brightness(98%) sepia(8%)" },
  vibrant_social: { filter: "contrast(110%) saturate(135%) brightness(102%)" },
  warm_vlog: { filter: "sepia(22%) saturate(115%) contrast(106%) brightness(104%)" },
  cold_teal: { filter: "hue-rotate(15deg) saturate(90%) contrast(115%) brightness(96%)" },
  vintage_film: { filter: "sepia(35%) contrast(92%) saturate(80%) brightness(98%)" },
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
  "9:16_fit": { width: 236, height: 420 },
  // Preview stays centre-cropped; the face tracking happens at render time.
  "9:16_face": { width: 236, height: 420 },
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
  /** 9:16 framing, 0 = whole frame (blurred bars) … 100 = filled. */
  zoom?: number
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
      zoom,
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
    const blurRef = React.useRef<HTMLCanvasElement>(null)
    const [isPlaying, setIsPlaying] = React.useState(false)
    const [videoAspect, setVideoAspect] = React.useState(16 / 9)

    // Same maths as backend _build_vertical_filter: the visible slice of the
    // source width goes from 100 % (zoom 0) to the 9:16 fill (zoom 100).
    const isVertical = aspectRatio.startsWith("9:16")
    const effectiveZoom = zoom ?? (aspectRatio === "9:16_fit" ? 0 : 100)
    const fillFraction = Math.min(1, (9 / 16) / videoAspect)
    const t = effectiveZoom / 100
    const visibleFraction = (1 - t) + t * fillFraction
    const videoScale = isVertical ? 1 / visibleFraction : 1

    // Blurred backdrop for the bars, redrawn from the video (~12 fps).
    React.useEffect(() => {
      if (!isVertical) return
      const video = videoRef.current
      const canvas = blurRef.current
      const ctx = canvas?.getContext("2d")
      if (!video || !canvas || !ctx) return
      let frame = 0
      let last = 0
      const draw = (now: number) => {
        if (now - last > 80 && video.readyState >= 2) {
          last = now
          const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight)
          const w = video.videoWidth * scale
          const h = video.videoHeight * scale
          try {
            ctx.drawImage(video, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
          } catch {
            // Cross-origin frame: leave the black background.
          }
        }
        frame = requestAnimationFrame(draw)
      }
      frame = requestAnimationFrame(draw)
      return () => cancelAnimationFrame(frame)
    }, [isVertical, src])

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
          {src && isVertical && (
            <canvas
              ref={blurRef}
              width={54}
              height={96}
              className="absolute inset-0 h-full w-full scale-110 blur-md"
              aria-hidden
            />
          )}
          {src ? (
            <video
              ref={videoRef}
              src={src}
              controls={showControls}
              preload="metadata"
              crossOrigin="anonymous"
              className={cn(
                "relative h-full w-full transition-transform",
                isVertical ? "object-contain" : "object-cover"
              )}
              style={{ ...(FILTER_STYLES[selectedFilter] ?? {}), transform: `scale(${videoScale})` }}
              onLoadedMetadata={() => {
                const video = videoRef.current
                if (!video) return
                video.currentTime = startTime
                if (video.videoWidth && video.videoHeight) {
                  setVideoAspect(video.videoWidth / video.videoHeight)
                }
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
