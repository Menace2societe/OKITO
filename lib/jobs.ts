const MAX_NETWORK_FAILURES = 15

// Polls a backend job URL until `isDone` returns true. Returns a cancel function.
export function pollJob<T>(
  url: string,
  onUpdate: (data: T) => void,
  isDone: (data: T) => boolean,
  onError: (message: string) => void,
  intervalMs = 2000
): () => void {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let networkFailures = 0

  const tick = async () => {
    let res: Response
    try {
      res = await fetch(url, { cache: "no-store" })
    } catch {
      // Network blip (phone waking up, Wi-Fi switch): the job keeps running
      // server-side, so retry for a while before giving up.
      if (stopped) return
      if (++networkFailures <= MAX_NETWORK_FAILURES) {
        timer = setTimeout(tick, intervalMs * 2)
      } else {
        onError("Connexion perdue avec le serveur")
      }
      return
    }
    networkFailures = 0
    try {
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Erreur serveur")
      if (stopped) return
      onUpdate(data)
      if (!isDone(data)) timer = setTimeout(tick, intervalMs)
    } catch (e) {
      if (!stopped) onError(e instanceof Error ? e.message : "Réponse invalide du serveur")
    }
  }
  void tick()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || "Erreur serveur")
  return data as T
}
