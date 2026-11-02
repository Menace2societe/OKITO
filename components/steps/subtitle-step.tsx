"use client"

import * as React from "react"
import { Loader2, Play, BookPlus } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"
import { TIRAGE_FRAME, Tampon, formatLength } from "@/components/tirage"
import { SUBTITLE_STYLES, type SubtitleStyle, type TranscriptWord, type WhisperQuality } from "@/lib/presets"
import { MAX_WORDS_PER_LINE, lineRanges, linesFromText } from "@/lib/subtitles"
import { Input } from "@/components/ui/input"
import type { TranscriptionState } from "@/components/use-transcription"
import { ONLINE } from "@/lib/backend"

interface SubtitleStepProps {
  fileId: string | null;
  videoPath: string | null;
  fileUrl: string | null;
  startTime: number;
  endTime: number;
  subtitlesEnabled: boolean;
  subtitleStyle: SubtitleStyle;
  videoFilter: VideoFilter;
  aspectRatio: AspectRatio;
  zoom: number;
  whisperQuality: WhisperQuality;
  vocabulary: string;
  onWhisperQualityChange: (quality: WhisperQuality) => void;
  onVocabularyChange: (vocabulary: string) => void;
  customSubtitles: string;
  /** Clip-relative Whisper words behind the text (null for pasted text). */
  transcriptWords: TranscriptWord[] | null;
  isolateVocals: boolean;
  onIsolateVocalsChange: (on: boolean) => void;
  onToggle: (enabled: boolean) => void;
  onStyleChange: (style: SubtitleStyle) => void;
  onCustomSubtitlesChange: (text: string) => void;
  transcription: TranscriptionState;
  onTranscribe: () => void;
}

// The print is sized to sit beside the controls on a laptop screen
// (same sizes as the trim step).
const TIRAGE_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "9:16": { width: 270, height: 480 },
  "9:16_fit": { width: 270, height: 480 },
  "9:16_face": { width: 270, height: 480 },
  "1:1": { width: 420, height: 420 },
  "16:9": { width: 560, height: 315 },
}

const QUALITIES: { value: WhisperQuality; label: string }[] = [
  { value: "accurate", label: "Précise" },
  { value: "fast", label: "Rapide" },
]

// Line start inside the clip, to the tenth of a second.
const formatClock = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, "0")
  return `${m}:${s}`
}

export function SubtitleStep({
  fileId,
  videoPath,
  fileUrl,
  startTime,
  endTime,
  subtitlesEnabled,
  subtitleStyle,
  videoFilter,
  aspectRatio,
  zoom,
  whisperQuality,
  vocabulary,
  onWhisperQualityChange,
  onVocabularyChange,
  customSubtitles,
  transcriptWords,
  isolateVocals,
  onIsolateVocalsChange,
  onToggle,
  onStyleChange,
  onCustomSubtitlesChange,
  transcription,
  onTranscribe,
}: SubtitleStepProps) {
  const playerRef = React.useRef<PreviewPlayerHandle>(null)
  const [currentTime, setCurrentTime] = React.useState(startTime)
  const [rawMode, setRawMode] = React.useState(false)
  const loadingTranscribe = transcription.status === "running"
  const transcribeError = transcription.status === "error" ? transcription.error : null
  const [elapsed, setElapsed] = React.useState(0)

  // Elapsed-time counter so a long transcription visibly progresses.
  React.useEffect(() => {
    if (!transcription.startedAt) return
    const tick = () => setElapsed(Math.round((Date.now() - transcription.startedAt!) / 1000))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [transcription.startedAt])

  const fetchTranscription = () => onTranscribe()

  // One editable row per subtitle line, each with the time it is sung at.
  const lines = React.useMemo(() => customSubtitles.split("\n"), [customSubtitles])
  const ranges = React.useMemo(
    () => (transcriptWords?.length ? lineRanges(lines, transcriptWords) : lines.map(() => null)),
    [lines, transcriptWords]
  )
  const lineEditor = !rawMode && !!transcriptWords?.length && customSubtitles.trim() !== ""

  const updateLine = (index: number, text: string) => {
    const next = [...lines]
    next[index] = text
    onCustomSubtitlesChange(next.join("\n"))
  }

  const playLine = (index: number) => {
    const range = ranges[index]
    if (!range) return
    playerRef.current?.playRange(
      Math.max(startTime, startTime + range.start - 0.15),
      Math.min(endTime, startTime + range.end + 0.35)
    )
  }

  // Remember a corrected phrase so the next transcriptions get it right.
  const addToVocabulary = (text: string) => {
    const phrase = text.trim()
    if (!phrase) return
    const entries = vocabulary.split(",").map((v) => v.trim()).filter(Boolean)
    if (entries.some((v) => v.toLowerCase() === phrase.toLowerCase())) return
    onVocabularyChange([...entries, phrase].join(", ").slice(0, 300))
  }

  // Line shown on the preview while playing (clip-relative time).
  const clipTime = currentTime - startTime
  const activeLine = ranges.findIndex((r) => r && clipTime >= r.start && clipTime <= r.end + 0.3)

  // Auto-load the transcription when subtitles are enabled and the field is
  // still empty. The job lives in the wizard: leaving this step doesn't lose it.
  React.useEffect(() => {
    if (!subtitlesEnabled) return
    if (!videoPath && !fileId) return
    if (customSubtitles.trim()) return
    if (transcription.status !== "idle") return
    onTranscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitlesEnabled, fileId, videoPath, startTime, endTime, customSubtitles])

  const wordCount = customSubtitles.split(/\s+/).filter(Boolean).length
  const vocabularyEntries = vocabulary.split(",").map((v) => v.trim().toLowerCase())
  const activePreset = SUBTITLE_STYLES.find((p) => p.value === subtitleStyle)
  const canTranscribe = !!fileId || !!videoPath
  const hasText = !!customSubtitles.trim()

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
        <PreviewPlayer
          ref={playerRef}
          onTimeUpdate={setCurrentTime}
          src={fileUrl}
          selectedFilter={videoFilter}
          aspectRatio={aspectRatio}
          zoom={zoom}
          startTime={startTime}
          endTime={endTime}
          showControls={false}
          size={TIRAGE_SIZES[aspectRatio]}
          frameClassName={TIRAGE_FRAME}
          frameFooter={
            <div className="flex w-0 min-w-full flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <p className="text-[15px] leading-snug text-gris">
                {subtitlesEnabled ? activePreset?.label : "Sans sous-titres"}
              </p>
              <Tampon start={startTime} end={endTime} className="ml-auto shrink-0" />
            </div>
          }
        >
          {subtitlesEnabled && (
            // Subtitle placement preview for the selected preset. The text
            // keeps the real render colours and outline (lib/presets.ts).
            <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-3 text-white">
              <span
                className={cn(
                  "px-2 text-center text-base leading-tight",
                  activePreset?.sampleClass,
                  subtitleStyle === "bold_tiktok" &&
                    "drop-shadow-[0_0_2px_#000] [text-shadow:0_0_3px_#000,0_0_3px_#000]",
                  subtitleStyle === "neon_yellow" &&
                    "[text-shadow:0_0_4px_#000,0_0_4px_#000]",
                  subtitleStyle === "impact_pop" &&
                    "[text-shadow:0_0_4px_#000,0_0_4px_#000,0_0_4px_#000]",
                  subtitleStyle === "minimal_clean" &&
                    "drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]"
                )}
              >
                {activeLine >= 0 && lines[activeLine]?.trim() ? (
                  lines[activeLine]
                ) : (
                  <>
                    Aperçu du{" "}
                    <span className={cn(activePreset?.highlightClass)}>sous-titre</span>
                  </>
                )}
              </span>
            </div>
          )}
        </PreviewPlayer>
      </div>

      <div className="min-w-0 space-y-10">
        <section aria-labelledby="soustitres-titre" className="space-y-6">
          <h1 id="soustitres-titre" className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
            Sous-titres
          </h1>

          <div className="flex min-h-12 items-center gap-4 border border-filet bg-papier p-5">
            <Switch
              id="subtitles-toggle"
              checked={subtitlesEnabled}
              onCheckedChange={onToggle}
            />
            <Label htmlFor="subtitles-toggle" className="text-base font-semibold">
              Ajouter des sous-titres au clip
              <span className="block text-[15px] font-normal text-gris">
                {subtitlesEnabled
                  ? "Le texte est tiré de la voix, mot à mot, puis incrusté dans la vidéo."
                  : "Le clip sortira sans sous-titres."}
              </span>
            </Label>
          </div>
        </section>

        {subtitlesEnabled && (
          <>
            <section aria-labelledby="transcription-titre" className="space-y-5 border-t border-filet pt-8">
              <h2 id="transcription-titre" className="text-2xl font-bold [font-stretch:92%]">Transcription</h2>

              <div className="space-y-2">
                <p id="qualite-titre" className="text-base font-semibold">Qualité</p>
                <div role="group" aria-labelledby="qualite-titre" className="flex w-fit border border-filet-fort">
                  {QUALITIES.map((q) => (
                    <button
                      key={q.value}
                      type="button"
                      aria-pressed={whisperQuality === q.value}
                      onClick={() => onWhisperQualityChange(q.value)}
                      className={cn(
                        "h-12 border-r border-filet px-5 text-base last:border-r-0",
                        whisperQuality === q.value ? "bg-encre font-semibold text-white" : "bg-papier hover:bg-accent"
                      )}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
                <p className="text-[15px] text-gris">
                  {whisperQuality === "accurate"
                    ? "Meilleure sur le rap et l'argot, environ 3 fois plus lente."
                    : "Plus rapide, mais plus d'erreurs sur les paroles chantées."}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vocabulary" className="text-base font-semibold">
                  Mots à reconnaître
                </Label>
                <Input
                  id="vocabulary"
                  value={vocabulary}
                  onChange={(e) => onVocabularyChange(e.target.value)}
                  placeholder="Ex : Okito, Kinshasa, darksides, yankee"
                />
                <p className="max-w-[68ch] text-[15px] text-gris">
                  Noms d&apos;artistes, lieux, argot : Whisper les écrira correctement. Gardé pour les
                  prochaines vidéos. Relance la transcription après l&apos;avoir modifié.
                </p>
              </div>

              <div className="flex min-h-12 items-center gap-3">
                <Switch id="isolate-vocals" checked={isolateVocals} onCheckedChange={onIsolateVocalsChange} />
                <Label htmlFor="isolate-vocals" className="text-base font-normal">
                  Isoler la voix avant la transcription
                  <span className="block text-[15px] text-gris">
                    Retire le beat (Demucs) pour que Whisper n&apos;entende que la voix. Conseillé pour
                    le rap ; ajoute environ 1 min pour 2 min de vidéo.
                  </span>
                </Label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  onClick={fetchTranscription}
                  disabled={loadingTranscribe || (!fileId && !videoPath)}
                  aria-busy={loadingTranscribe}
                >
                  {loadingTranscribe && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                  {hasText || transcribeError ? "Relancer la transcription" : "Transcrire"}
                </Button>
                {!!transcriptWords?.length && hasText && (
                  <Button variant="outline" onClick={() => setRawMode((v) => !v)}>
                    {rawMode ? "Éditer ligne par ligne" : "Éditer en texte brut"}
                  </Button>
                )}
              </div>

              <div aria-live="polite" className="space-y-3">
                {loadingTranscribe && (
                  <div className="space-y-2">
                    <p className="max-w-[68ch] text-[15px] text-encre">
                      <span className="chiffres font-semibold">{formatLength(elapsed)}</span>
                      {" · "}
                      {isolateVocals ? "Isolation de la voix puis transcription" : "Transcription"} du
                      passage. La première fois, compte à peu près sa durée. Tu peux passer à
                      l&apos;étape suivante ou verrouiller le téléphone : le résultat t&apos;attend.
                    </p>
                    <div className="h-1.5 bg-filet">
                      <div className="h-full w-full animate-pulse bg-tampon" />
                    </div>
                  </div>
                )}
                {transcribeError && (
                  <p className="max-w-[68ch] text-[15px] text-erreur">
                    {transcribeError} Relance la transcription ; si l&apos;erreur revient, vérifie que le
                    serveur tourne.
                  </p>
                )}
                {!loadingTranscribe && !transcribeError && !canTranscribe && (
                  <p className="text-[15px] text-gris">Importe d&apos;abord une vidéo pour la transcrire.</p>
                )}
              </div>

              <p className="text-[15px] text-gris">
                {ONLINE
                  ? "Transcription par Whisper sur le serveur ClipFlow, sans service tiers."
                  : "Transcription locale par Whisper, sans service en ligne."}
              </p>
            </section>

            <section aria-labelledby="texte-titre" className="space-y-4 border-t border-filet pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="texte-titre" className="text-2xl font-bold [font-stretch:92%]">
                  Texte des sous-titres
                </h2>
                <span className="chiffres text-[15px] text-gris">
                  {wordCount} mot{wordCount > 1 ? "s" : ""} · {MAX_WORDS_PER_LINE} au plus par ligne
                </span>
              </div>

              {lineEditor ? (
                <>
                  <p className="max-w-[68ch] text-[15px] text-gris">
                    Le bouton lecture rejoue la ligne. Corrige le texte directement : le timing de
                    la voix est gardé. Le bouton livre ajoute la phrase aux mots à reconnaître.
                  </p>
                  <ol aria-labelledby="texte-titre" className="max-h-[32rem] overflow-y-auto border border-filet bg-papier">
                    {lines.map((line, i) => {
                      const range = ranges[i]
                      const known = vocabularyEntries.includes(line.trim().toLowerCase())
                      const playing = i === activeLine
                      return (
                        <li
                          key={i}
                          aria-current={playing ? "true" : undefined}
                          className={cn(
                            "grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-x-2 border-b border-filet px-1 py-1 last:border-b-0 sm:grid-cols-[3rem_4.25rem_minmax(0,1fr)_3rem]",
                            playing && "bg-tampon/[0.08]"
                          )}
                        >
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => playLine(i)}
                            disabled={!range}
                            title="Écouter cette ligne"
                            aria-label={`Écouter la ligne ${i + 1}`}
                          >
                            <Play aria-hidden className="h-4 w-4" />
                          </Button>
                          <span className={cn("chiffres text-[15px]", playing ? "font-semibold text-tampon" : "text-gris")}>
                            {range ? formatClock(range.start) : "—"}
                          </span>
                          <Input
                            value={line}
                            onChange={(e) => updateLine(i, e.target.value)}
                            className={cn("order-last col-span-3 border-transparent bg-transparent px-2 hover:border-filet sm:order-none sm:col-span-1", playing && "text-tampon")}
                            aria-label={`Ligne ${i + 1}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => addToVocabulary(line)}
                            disabled={!line.trim() || known}
                            title={known ? "Déjà dans les mots à reconnaître" : "Ajouter aux mots à reconnaître"}
                            aria-label={known ? "Déjà dans les mots à reconnaître" : "Ajouter aux mots à reconnaître"}
                          >
                            <BookPlus aria-hidden className="h-4 w-4" />
                          </Button>
                        </li>
                      )
                    })}
                  </ol>
                </>
              ) : (
                <>
                  <p className="max-w-[68ch] text-[15px] text-gris">
                    Corrige la transcription ou colle tes paroles. Les mots corrigés gardent le
                    timing de la voix trouvé par Whisper ; un texte collé sans transcription est
                    réparti sur la durée du passage.
                  </p>
                  <textarea
                    id="custom-subtitles"
                    aria-labelledby="texte-titre"
                    value={customSubtitles}
                    onChange={(e) => onCustomSubtitlesChange(e.target.value)}
                    onBlur={() => {
                      // Pasted text without timings: show it as 4-word lines.
                      if (!transcriptWords?.length && customSubtitles.trim()) {
                        onCustomSubtitlesChange(linesFromText(customSubtitles))
                      }
                    }}
                    rows={8}
                    placeholder={
                      "Colle ici tes paroles ou la transcription…\nEx : On arrive dans le game, personne ne peut nous stopper"
                    }
                    className="flex w-full border border-filet-fort bg-papier px-4 py-3 text-base placeholder:text-gris disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </>
              )}
            </section>

            <section aria-labelledby="style-titre" className="space-y-4 border-t border-filet pt-8">
              <h2 id="style-titre" className="text-2xl font-bold [font-stretch:92%]">Style des sous-titres</h2>
              <div role="radiogroup" aria-labelledby="style-titre" className="grid gap-px border border-filet bg-filet sm:grid-cols-2">
                {SUBTITLE_STYLES.map((preset) => {
                  const on = subtitleStyle === preset.value
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onStyleChange(preset.value)}
                      className={cn(
                        "flex flex-col gap-3 p-4 text-left transition-colors",
                        on ? "bg-encre text-white" : "bg-papier hover:bg-accent"
                      )}
                    >
                      {/* Real render colours of the style (lib/presets.ts). White
                          underneath, so the sample stays readable on ink. */}
                      <span
                        aria-hidden
                        className={cn(
                          "flex min-h-[64px] w-full items-center justify-center border bg-encre px-3 text-center text-base leading-tight text-white",
                          on ? "border-white/30" : "border-encre"
                        )}
                      >
                        <span className={preset.sampleClass}>
                          Aperçu du{" "}
                          <span className={cn(preset.highlightClass)}>sous-titre</span>
                        </span>
                      </span>
                      <span>
                        <span className="block text-base font-semibold">{preset.label}</span>
                        <span className={cn("block text-[15px]", on ? "text-white/80" : "text-gris")}>
                          {preset.description}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
