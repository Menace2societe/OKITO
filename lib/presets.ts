// Shared filter / subtitle presets. Keys must match the backend:
// VIDEO_FILTERS in backend/services/ffmpeg_service.py and
// ASS_STYLE_PRESETS in backend/services/subtitle_service.py.

export type VideoFilter =
  | "cinema_intense"
  | "vibrant_social"
  | "warm_vlog"
  | "cold_teal"
  | "vintage_film"
  | "bw_deep"
  | "none"

export type SubtitleStyle = "bold_tiktok" | "neon_yellow" | "impact_pop" | "minimal_clean"

export type WhisperQuality = "accurate" | "fast"

export interface TranscriptWord {
  text: string
  start: number
  end: number
}

export const VIDEO_FILTERS: { value: VideoFilter; label: string; description: string }[] = [
  { value: "cinema_intense", label: "Cinéma Intense", description: "Teal & orange, contraste marqué, vignette" },
  { value: "vibrant_social", label: "Vibrant Social", description: "Couleurs vives qui préservent la peau" },
  { value: "warm_vlog", label: "Warm Vlog", description: "Lumière dorée, ambiance golden hour" },
  { value: "cold_teal", label: "Cold Teal", description: "Bleu froid, ambiance nocturne" },
  { value: "vintage_film", label: "Vintage Film", description: "Pellicule délavée avec grain" },
  { value: "bw_deep", label: "Noir & Blanc Profond", description: "Monochrome contrasté avec grain fin" },
  { value: "none", label: "Aucun Filtre", description: "Conserver le rendu d'origine" },
]

export const SUBTITLE_STYLES: {
  value: SubtitleStyle
  label: string
  description: string
  sampleClass: string
  highlightClass: string | null
}[] = [
  {
    value: "bold_tiktok",
    label: "Bold TikTok",
    description: "Blanc, contour noir épais, mot prononcé en jaune",
    sampleClass: "font-extrabold text-white",
    highlightClass: "text-yellow-300",
  },
  {
    value: "neon_yellow",
    label: "Neon Yellow",
    description: "Jaune vif, mot prononcé en blanc",
    sampleClass: "font-extrabold text-yellow-300",
    highlightClass: "text-white",
  },
  {
    value: "impact_pop",
    label: "Impact Pop",
    description: "MAJUSCULES, mot prononcé en vert avec effet pop",
    sampleClass: "font-black uppercase text-white text-lg",
    highlightClass: "text-green-400",
  },
  {
    value: "minimal_clean",
    label: "Minimal Clean",
    description: "Blanc pur, ombre légère, sans animation",
    sampleClass: "font-medium text-white",
    highlightClass: null,
  },
]

export const pickRandom = <T,>(items: readonly T[], exclude?: T): T => {
  const pool = items.length > 1 ? items.filter((i) => i !== exclude) : items
  return pool[Math.floor(Math.random() * pool.length)]
}

// Durations offered for random / best-moment clips (seconds) — Shorts cap at 60 s.
export const CLIP_DURATIONS = [
  { label: "15–30 s", min: 15, max: 30 },
  { label: "30–60 s", min: 30, max: 60 },
  { label: "60–90 s", min: 60, max: 90 },
]

export interface Moment {
  start_time: number
  end_time: number
  title: string
  reason: string
  score: number
  text: string
  words: TranscriptWord[]
  source: "claude" | "heuristic"
}
