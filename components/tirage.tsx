import * as React from "react"
import { cn } from "@/lib/utils"

// mm:ss, or h:mm:ss past an hour.
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = m.toString().padStart(2, "0")
  const ss = s.toString().padStart(2, "0")
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Seconds as "17 s" or "1 min 05 s".
export function formatLength(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  if (total < 60) return `${total} s`
  return `${Math.floor(total / 60)} min ${(total % 60).toString().padStart(2, "0")} s`
}

// The white border of a studio print, around the preview.
export const TIRAGE_FRAME =
  "bg-papier p-3 pb-0 shadow-[0_1px_0_hsl(var(--filet-fort)),0_12px_28px_-16px_rgba(28,31,36,0.45)] sm:p-5 sm:pb-0"

interface TamponProps {
  start: number
  end: number
  detail?: string
  /** Changes when the stamp should land again (a moment picked, a clip done). */
  landKey?: number
  className?: string
}

// The studio's violet stamp, carrying the clip's times.
export function Tampon({ start, end, detail, landKey = 0, className }: TamponProps) {
  return (
    <div
      key={landKey}
      className={cn(
        "chiffres inline-block -rotate-[4deg] border-[2.5px] border-tampon px-3 py-1.5 leading-tight text-tampon opacity-[0.94]",
        landKey > 0 && "tampon-pose",
        className
      )}
    >
      <span className="block text-[17px] font-bold [font-stretch:90%]">
        {formatClock(start)} → {formatClock(end)}
      </span>
      <span className="block text-[15px] font-medium">
        {formatLength(end - start)}
        {detail ? ` · ${detail}` : ""}
      </span>
    </div>
  )
}
