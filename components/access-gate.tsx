"use client"

import * as React from "react"
import { KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ONLINE, checkHealth, getAccessCode, hasBackend, setAccessCode, type BackendRole } from "@/lib/backend"

type GateState = "checking" | "asleep" | "locked" | "open"

// The backend that must accept the code: the cloud one when configured.
const GATE_ROLE: BackendRole = hasBackend("cloud") ? "cloud" : "pc"
// The Space takes 1–2 minutes to wake up after a pause.
const WAKE_RETRY_MS = 5000

// Online, asks for the access code before showing the app. Local: renders
// the app directly.
export function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<GateState>(ONLINE ? "checking" : "open")
  const [code, setCode] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!ONLINE) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      const health = await checkHealth(GATE_ROLE)
      if (cancelled) return
      if (!health) {
        setState("asleep")
        timer = setTimeout(check, WAKE_RETRY_MS)
      } else {
        setState(health.authorized ? "open" : "locked")
      }
    }
    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const health = await checkHealth(GATE_ROLE, code.trim())
    setSubmitting(false)
    if (!health) {
      setError("Le serveur ne répond pas. Réessaie dans une minute.")
    } else if (!health.authorized) {
      setError("Code incorrect.")
    } else {
      setAccessCode(code.trim())
      setState("open")
    }
  }

  if (state === "open") return <>{children}</>

  return (
    <Card className="mx-auto w-full max-w-md p-6 sm:p-8">
      {state === "checking" || state === "asleep" ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="font-medium">
            {state === "checking" ? "Connexion au serveur…" : "Réveil du serveur…"}
          </p>
          {state === "asleep" && (
            <p className="text-sm text-muted-foreground">
              Après une pause, le serveur met une à deux minutes à redémarrer.
            </p>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Code d&apos;accès</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {getAccessCode() ? "Le code enregistré n'est plus valable." : "Entre le code pour utiliser ClipFlow."}
          </p>
          <Input
            type="password"
            autoComplete="current-password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Code d'accès"
            autoFocus
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting || !code.trim()}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Entrer
          </Button>
        </form>
      )}
    </Card>
  )
}
