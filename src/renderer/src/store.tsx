/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Agent, AppData, RunDataEvent, RunInfo } from '../../shared/types'

type ChunkListener = (e: RunDataEvent) => void

interface Store {
  data: AppData | null
  runs: RunInfo[]
  /** Çalışmanın şu ana kadarki çıktısı */
  outputOf: (runId: string) => string
  /** Çıktı her değiştiğinde artar; çıktı gösteren bileşenler yeniden çizilsin diye */
  outputTick: number
  subscribeChunks: (fn: ChunkListener) => () => void
  startRun: (agentId: string, prompt: string) => Promise<RunInfo | null>
  error: string | null
  setError: (e: string | null) => void
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider eksik')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const [runs, setRuns] = useState<RunInfo[]>([])
  const [outputTick, setOutputTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const outputs = useRef(new Map<string, string>())
  const listeners = useRef(new Set<ChunkListener>())
  const tickPending = useRef(false)

  useEffect(() => {
    window.api.data.load().then(setData)
    const offData = window.api.data.onChanged(setData)

    // Uygulama yeniden yüklenirse süren çalışmaları ve çıktıları geri al
    window.api.runs.list().then(async (list) => {
      for (const r of list) outputs.current.set(r.id, await window.api.runs.output(r.id))
      setRuns(list)
      setOutputTick((t) => t + 1)
    })

    const offUpdate = window.api.runs.onUpdate((r) => {
      setRuns((prev) => {
        const i = prev.findIndex((x) => x.id === r.id)
        if (i < 0) return [...prev, r]
        const next = prev.slice()
        next[i] = r
        return next
      })
    })
    const offChunk = window.api.runs.onData((e) => {
      outputs.current.set(e.runId, (outputs.current.get(e.runId) ?? '') + e.chunk)
      listeners.current.forEach((fn) => fn(e))
      // Çok sık gelen parçalar için çizimi kare başına bir kez yap
      if (!tickPending.current) {
        tickPending.current = true
        requestAnimationFrame(() => {
          tickPending.current = false
          setOutputTick((t) => t + 1)
        })
      }
    })
    return () => {
      offData()
      offUpdate()
      offChunk()
    }
  }, [])

  const outputOf = useCallback((runId: string) => outputs.current.get(runId) ?? '', [])

  const subscribeChunks = useCallback((fn: ChunkListener) => {
    listeners.current.add(fn)
    return () => {
      listeners.current.delete(fn)
    }
  }, [])

  const startRun = useCallback(async (agentId: string, prompt: string) => {
    try {
      const r = await window.api.runs.start(agentId, prompt)
      setRuns((prev) =>
        prev.some((x) => x.id === r.id)
          ? prev.map((x) => (x.id === r.id ? { ...x, ...r } : x))
          : [...prev, r]
      )
      return r
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
          : String(err)
      )
      return null
    }
  }, [])

  const value = useMemo(
    () => ({ data, runs, outputOf, outputTick, subscribeChunks, startRun, error, setError }),
    [data, runs, outputOf, outputTick, subscribeChunks, startRun, error]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useTeamAgents(): Agent[] {
  const { data } = useStore()
  if (!data) return []
  const teamId = data.settings.activeTeamId ?? data.teams[0]?.id
  return data.agents
    .filter((a) => a.teamId === teamId)
    .sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.createdAt - b.createdAt)
}

export function useActiveTeam(): AppData['teams'][number] | undefined {
  const { data } = useStore()
  if (!data) return undefined
  return data.teams.find((t) => t.id === data.settings.activeTeamId) ?? data.teams[0]
}
