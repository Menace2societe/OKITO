"use client"

import * as React from "react"
import { Wand2, Loader2, RefreshCcw, Play, BookPlus, ListChecks, Type } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { PreviewPlayer, type AspectRatio, type PreviewPlayerHandle, type VideoFilter } from "@/components/preview-player"
import { cn } from "@/lib/utils"
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

  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between p-6">
        <div className="space-y-1">
          <Label htmlFor="subtitles-toggle" className="text-base">
            Activer les sous-titres
          </Label>
          <p className="text-sm text-muted-foreground">
            Générer automatiquement des sous-titres pour la vidéo
          </p>
        </div>
        <Switch
          id="subtitles-toggle"
          checked={subtitlesEnabled}
          onCheckedChange={onToggle}
        />
      </Card>

      {subtitlesEnabled && (
        <div className="space-y-6 animate-in slide-in-from-top-4 fade-in-50">
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
            caption={
              <p className="text-xs text-muted-foreground">
                Aperçu du cadrage, du filtre et du placement des sous-titres
              </p>
            }
          >
            {/* Subtitle placement preview for the selected preset */}
            <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center px-3">
              <span
                className={cn(
                  "rounded px-2 text-center text-base leading-tight",
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
          </PreviewPlayer>

          <Card className="space-y-3 p-4">
            <div className="space-y-2">
              <Label htmlFor="vocabulary" className="text-base">
                Mots à reconnaître
              </Label>
              <Input
                id="vocabulary"
                value={vocabulary}
                onChange={(e) => onVocabularyChange(e.target.value)}
                placeholder="Ex : Okito, Kinshasa, darksides, yankee"
              />
              <p className="text-xs text-muted-foreground">
                Noms d&apos;artistes, lieux, argot : Whisper les écrira correctement.
                Mémorisé pour les prochaines vidéos. Relancez la transcription après
                l&apos;avoir modifié.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Transcription :</span>
              <Button
                size="sm"
                variant={whisperQuality === "accurate" ? "secondary" : "ghost"}
                onClick={() => onWhisperQualityChange("accurate")}
              >
                Précise
              </Button>
              <Button
                size="sm"
                variant={whisperQuality === "fast" ? "secondary" : "ghost"}
                onClick={() => onWhisperQualityChange("fast")}
              >
                Rapide
              </Button>
              <span className="text-xs text-muted-foreground">
                {whisperQuality === "accurate"
                  ? "Meilleure sur le rap et l'argot, ~3× plus lente."
                  : "Plus rapide, plus d'erreurs sur les paroles chantées."}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="isolate-vocals" checked={isolateVocals} onCheckedChange={onIsolateVocalsChange} />
              <Label htmlFor="isolate-vocals" className="text-sm font-normal">
                Isoler la voix avant la transcription
                <span className="block text-xs text-muted-foreground">
                  Retire le beat (Demucs) pour que Whisper n&apos;entende que la voix. Recommandé
                  pour le rap ; ajoute environ 1 min pour 2 min de vidéo.
                </span>
              </Label>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="custom-subtitles" className="text-base">
                Texte des sous-titres
              </Label>
              <span className="text-xs text-muted-foreground">
                {wordCount} mot{wordCount > 1 ? "s" : ""} · {MAX_WORDS_PER_LINE} max/ligne
              </span>
            </div>
            {lineEditor ? (
              <>
                <p className="text-sm text-muted-foreground">
                  ▶ rejoue la ligne pour l&apos;écouter, corrigez le texte directement :
                  le timing de la voix est conservé. <BookPlus className="inline h-3 w-3" /> ajoute
                  la phrase aux mots à reconnaître pour les prochaines vidéos.
                </p>
                <div className="max-h-96 space-y-1 overflow-y-auto pr-1">
                  {lines.map((line, i) => {
                    const range = ranges[i]
                    const known = vocabularyEntries.includes(line.trim().toLowerCase())
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-1 py-0.5",
                          i === activeLine && "bg-primary/10"
                        )}
                      >
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => playLine(i)}
                          disabled={!range}
                          title="Écouter cette ligne"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                        <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                          {range ? formatClock(range.start) : "—"}
                        </span>
                        <Input
                          value={line}
                          onChange={(e) => updateLine(i, e.target.value)}
                          className="h-8"
                          aria-label={`Ligne ${i + 1}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0"
                          onClick={() => addToVocabulary(line)}
                          disabled={!line.trim() || known}
                          title={known ? "Déjà dans les mots à reconnaître" : "Ajouter aux mots à reconnaître"}
                        >
                          <BookPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Corrigez la transcription ou collez vos paroles. Les mots corrigés
                  gardent le timing de la voix détecté par Whisper ; un texte collé
                  sans transcription est réparti sur la durée de l&apos;extrait.
                </p>
                <textarea
                  id="custom-subtitles"
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
                    "Collez ici vos paroles ou la transcription...\nEx : On arrive dans le game, personne ne peut nous stopper"
                  }
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={fetchTranscription}
                disabled={loadingTranscribe || (!fileId && !videoPath)}
              >
                {loadingTranscribe ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : customSubtitles.trim() || transcribeError ? (
                  <RefreshCcw className="mr-2 h-4 w-4" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                {customSubtitles.trim() || transcribeError
                  ? "Relancer la transcription"
                  : "Générer depuis l'audio"}
              </Button>
              {!!transcriptWords?.length && customSubtitles.trim() && (
                <Button variant="ghost" onClick={() => setRawMode((v) => !v)}>
                  {rawMode ? <ListChecks className="mr-2 h-4 w-4" /> : <Type className="mr-2 h-4 w-4" />}
                  {rawMode ? "Éditeur ligne par ligne" : "Texte brut"}
                </Button>
              )}
            </div>

            {loadingTranscribe && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {elapsed} s — {isolateVocals ? "Isolation de la voix puis transcription" : "Transcription"} de la vidéo (la première fois, compter à peu près sa durée sur CPU). Vous pouvez passer à l&apos;étape suivante ou verrouiller le téléphone : le résultat vous attend.
              </p>
            )}
            {transcribeError && (
              <div className="space-y-3 rounded-lg bg-destructive/15 p-3 text-sm text-destructive border border-destructive/50">
                <p>{transcribeError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fetchTranscription}
                  disabled={loadingTranscribe || (!fileId && !videoPath)}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Relancer
                </Button>
              </div>
            )}
          </Card>

          <div className="space-y-3">
            <h3 className="font-semibold">Style des sous-titres</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SUBTITLE_STYLES.map((preset) => (
                <Card
                  key={preset.value}
                  className={cn(
                    "cursor-pointer p-4 transition-colors hover:bg-accent",
                    subtitleStyle === preset.value && "border-primary bg-primary/5"
                  )}
                  onClick={() => onStyleChange(preset.value)}
                >
                  <h4 className="font-semibold">{preset.label}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {preset.description}
                  </p>
                </Card>
              ))}
            </div>
          </div>

          <Badge variant="secondary" className="mt-4">
            {ONLINE
              ? "Transcription via Whisper sur le serveur ClipFlow (aucun service tiers)"
              : "Transcription locale via Whisper (aucun service cloud)"}
          </Badge>
        </div>
      )}
    </div>
  )
}
