"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
      setError("Code incorrect. Vérifie-le et réessaie, ou redemande-le à Jonathan.")
    } else {
      setAccessCode(code.trim())
      setState("open")
    }
  }

  if (state === "open") return <>{children}</>

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-toile text-white">
        <div className="mx-auto flex max-w-[1440px] items-center px-4 py-4 sm:px-10 lg:min-h-24">
          <p className="text-2xl font-extrabold tracking-[-0.01em] [font-stretch:112%]">ClipFlow</p>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-12 sm:items-center sm:py-16">
        <div className="w-full max-w-md border border-filet bg-papier p-6 sm:p-8">
          {state === "checking" || state === "asleep" ? (
            <div aria-live="polite" className="flex flex-col items-start gap-3">
              <h1 className="flex items-center gap-3 text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
                <Loader2 aria-hidden className="h-7 w-7 shrink-0 animate-spin text-toile" />
                {state === "checking" ? "Connexion au serveur…" : "Réveil du serveur…"}
              </h1>
              {state === "asleep" && (
                <p className="text-[15px] text-gris">
                  Après une pause, le serveur met une à deux minutes à redémarrer. Cette page réessaie toute seule :
                  garde-la ouverte.
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <h1 className="text-[34px] font-extrabold leading-tight tracking-[-0.01em] [font-stretch:92%]">
                Code d&apos;accès
              </h1>
              <p className="text-base text-encre">
                {getAccessCode() ? "Le code enregistré n'est plus valable. Entre le nouveau code." : "Entre le code pour utiliser ClipFlow."}
              </p>
              <div className="space-y-2">
                <Input
                  type="password"
                  autoComplete="current-password"
                  aria-label="Code d'accès"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "code-erreur" : undefined}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Code d'accès"
                  autoFocus
                />
                {error && (
                  <p id="code-erreur" role="alert" className="text-[15px] text-erreur">
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !code.trim()}>
                {submitting && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
                Entrer
              </Button>
              <p className="border-t border-filet pt-4 text-[15px] text-gris">
                Le code se demande à Jonathan sur WhatsApp.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
