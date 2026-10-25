"use client"

import * as React from "react"
import { ONLINE, checkHealth, hasBackend } from "@/lib/backend"

// "local": the app runs on the PC itself, YouTube links always work.
export type PcStatus = "local" | "checking" | "online" | "offline"

const PC_CHECK_MS = 30_000

// Online, tells whether the PC (the only backend YouTube lets through) is up.
export function usePcStatus(): PcStatus {
  const watched = ONLINE && hasBackend("pc")
  const [status, setStatus] = React.useState<PcStatus>(watched ? "checking" : ONLINE ? "offline" : "local")

  React.useEffect(() => {
    if (!watched) return
    let cancelled = false
    const check = async () => {
      const health = await checkHealth("pc")
      if (!cancelled) setStatus(health?.authorized ? "online" : "offline")
    }
    void check()
    const timer = setInterval(check, PC_CHECK_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [watched])

  return status
}
