"use client"

import * as React from "react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface SubtitleStepProps {
  subtitlesEnabled: boolean;
  subtitleStyle: "karaoke" | "classic";
  onToggle: (enabled: boolean) => void;
  onStyleChange: (style: "karaoke" | "classic") => void;
}

export function SubtitleStep({
  subtitlesEnabled,
  subtitleStyle,
  onToggle,
  onStyleChange,
}: SubtitleStepProps) {
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
        <div className="space-y-4 animate-in slide-in-from-top-4 fade-in-50">
          <div className="grid grid-cols-2 gap-4">
            <Card
              className={cn(
                "cursor-pointer p-4 transition-colors hover:bg-accent",
                subtitleStyle === "karaoke" && "border-primary bg-primary/5"
              )}
              onClick={() => onStyleChange("karaoke")}
            >
              <h4 className="font-semibold">Karaoké</h4>
              <p className="text-sm text-muted-foreground">
                Les mots s'illuminent un par un
              </p>
            </Card>
            <Card
              className={cn(
                "cursor-pointer p-4 transition-colors hover:bg-accent",
                subtitleStyle === "classic" && "border-primary bg-primary/5"
              )}
              onClick={() => onStyleChange("classic")}
            >
              <h4 className="font-semibold">Classique</h4>
              <p className="text-sm text-muted-foreground">
                Sous-titres standard en bas
              </p>
            </Card>
          </div>
          <Badge variant="secondary" className="mt-4">
            Transcription locale via Whisper (aucun service cloud)
          </Badge>
        </div>
      )}
    </div>
  )
}
