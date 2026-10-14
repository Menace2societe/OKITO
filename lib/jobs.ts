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

  const tick = async () => {
    try {
      const res = await fetch(url, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "Erreur serveur")
      if (stopped) return
      onUpdate(data)
      if (!isDone(data)) timer = setTimeout(tick, intervalMs)
    } catch (e) {
      if (!stopped) onError(e instanceof Error ? e.message : "Connexion perdue avec le serveur")
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
