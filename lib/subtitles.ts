import type { TranscriptWord } from "@/lib/presets"

// Mirrors backend/services/subtitle_service.py so the editor shows the same
// lines as the burned-in subtitles.
export const MAX_WORDS_PER_LINE = 4
const LINE_BREAK_PAUSE = 0.6

const endsSentence = (text: string) => /[.!?…]$/.test(text.trim())

/** Cut Whisper words into lines: max 4 words, break at sentence ends and pauses. */
export function linesFromWords(words: TranscriptWord[]): string {
  const lines: string[] = []
  let current: string[] = []
  words.forEach((word, i) => {
    current.push(word.text.trim())
    const next = words[i + 1]
    if (
      current.length >= MAX_WORDS_PER_LINE ||
      endsSentence(word.text) ||
      !next ||
      next.start - word.end > LINE_BREAK_PAUSE
    ) {
      lines.push(current.join(" "))
      current = []
    }
  })
  return lines.join("\n")
}

/** Fallback for pasted text without timings: fixed 4-word lines. */
export function linesFromText(text: string): string {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  for (let i = 0; i < words.length; i += MAX_WORDS_PER_LINE) {
    lines.push(words.slice(i, i + MAX_WORDS_PER_LINE).join(" "))
  }
  return lines.join("\n")
}

// Compare words without case or punctuation ("Darksides," == "darksides").
const norm = (t: string) => t.toLowerCase().replace(/[.,!?;:…"«»()\[\]\-–—]+/g, "")

export interface LineRange {
  start: number
  end: number
}

/**
 * Time range (clip-relative) of each text line, found by aligning the edited
 * tokens on the transcribed words (longest common subsequence). Corrected
 * words don't match, but their line still gets the time of its unchanged
 * neighbours, so ▶ keeps replaying the right passage after an edit.
 */
export function lineRanges(lines: string[], words: TranscriptWord[]): (LineRange | null)[] {
  const tokens: { line: number; key: string }[] = []
  lines.forEach((line, li) =>
    line.split(/\s+/).filter(Boolean).forEach((t) => tokens.push({ line: li, key: norm(t) }))
  )
  const keys = words.map((w) => norm(w.text))
  const n = tokens.length
  const m = keys.length
  if (!n || !m) return lines.map(() => null)

  // LCS table on a flat Uint16Array (n, m ≲ a few hundred).
  const dp = new Uint16Array((n + 1) * (m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] =
        tokens[i].key && tokens[i].key === keys[j]
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1])
    }
  }
  const match: (number | null)[] = new Array(n).fill(null)
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (tokens[i].key && tokens[i].key === keys[j]) {
      match[i++] = j++
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      i++
    } else {
      j++
    }
  }

  // An unmatched edge token sits between its matched neighbours: it starts
  // after the previous matched word and ends before the next one.
  const startOf = (i: number) => {
    for (let k = i - 1; k >= 0; k--) if (match[k] !== null) return words[match[k]!].end
    return words[0].start
  }
  const endOf = (i: number) => {
    for (let k = i + 1; k < n; k++) if (match[k] !== null) return words[match[k]!].start
    return words[m - 1].end
  }

  return lines.map((_, li) => {
    const idx = tokens.map((t, i) => (t.line === li ? i : -1)).filter((i) => i >= 0)
    if (!idx.length) return null
    const first = idx[0]
    const last = idx[idx.length - 1]
    const exactStart = match[first] !== null ? words[match[first]!].start : null
    const exactEnd = match[last] !== null ? words[match[last]!].end : null
    const start = exactStart ?? startOf(first)
    const end = Math.max(start, exactEnd ?? endOf(last))
    return { start, end }
  })
}
