import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  API_LABELS,
  CLI_LABELS,
  type ApiProvider,
  type CliId,
  type Settings,
  type UsageSummary
} from '../shared/types'

// Yerel kullanım kaydı. CLI'lar abonelik limitlerini dışarıya güvenilir şekilde
// vermediği için burada yalnızca AjanGrid üzerinden yapılan çalışmalar sayılır
// ve CLI'ın "limit doldu" mesajları işaretlenir. API tarafında token ve
// (fiyat girildiyse) maliyet tutulur.

interface Entry {
  ts: number
  kind: 'cli' | 'api'
  key: string
  input?: number
  output?: number
  cost?: number
  limit?: boolean
}

const KEEP_MS = 62 * 24 * 3600 * 1000
const file = (): string => join(app.getPath('userData'), 'usage.json')
let entries: Entry[] | null = null

function load(): Entry[] {
  if (entries) return entries
  try {
    entries = existsSync(file()) ? (JSON.parse(readFileSync(file(), 'utf8')) as Entry[]) : []
  } catch {
    entries = []
  }
  return entries
}

let saveTimer: NodeJS.Timeout | null = null
function persist(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const cut = Date.now() - KEEP_MS
    entries = load().filter((e) => e.ts >= cut)
    try {
      writeFileSync(file(), JSON.stringify(entries), 'utf8')
    } catch {
      /* yazılamazsa sessiz geç */
    }
  }, 1000)
}

export function costOf(
  settings: Settings,
  provider: ApiProvider,
  input: number,
  output: number
): number | undefined {
  const p = settings.apiPricing?.[provider]
  if (!p || (!p.input && !p.output)) return undefined
  return (input / 1e6) * p.input + (output / 1e6) * p.output
}

export function recordCli(cli: CliId, limit: boolean): void {
  load().push({ ts: Date.now(), kind: 'cli', key: cli, limit })
  persist()
}

export function recordApi(
  provider: ApiProvider,
  input: number,
  output: number,
  cost?: number
): void {
  load().push({ ts: Date.now(), kind: 'api', key: provider, input, output, cost })
  persist()
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfMonth(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function apiCostToday(provider: ApiProvider): number {
  const t = startOfToday()
  return load()
    .filter((e) => e.kind === 'api' && e.key === provider && e.ts >= t)
    .reduce((s, e) => s + (e.cost ?? 0), 0)
}

export function summary(settings: Settings): UsageSummary {
  const all = load()
  const now = Date.now()
  const today = startOfToday()
  const month = startOfMonth()
  const cli = (Object.keys(CLI_LABELS) as CliId[]).map((c) => {
    const mine = all.filter((e) => e.kind === 'cli' && e.key === c)
    const limits = mine.filter((e) => e.limit)
    return {
      cli: c,
      runs5h: mine.filter((e) => e.ts >= now - 5 * 3600 * 1000).length,
      runsToday: mine.filter((e) => e.ts >= today).length,
      lastLimitAt: limits.length ? limits[limits.length - 1].ts : null
    }
  })
  const api = (Object.keys(API_LABELS) as ApiProvider[]).map((p) => {
    const mine = all.filter((e) => e.kind === 'api' && e.key === p)
    const td = mine.filter((e) => e.ts >= today)
    return {
      provider: p,
      inputToday: td.reduce((s, e) => s + (e.input ?? 0), 0),
      outputToday: td.reduce((s, e) => s + (e.output ?? 0), 0),
      costToday: td.reduce((s, e) => s + (e.cost ?? 0), 0),
      costMonth: mine.filter((e) => e.ts >= month).reduce((s, e) => s + (e.cost ?? 0), 0),
      capUsd: settings.apiDailyCapUsd?.[p] ?? 0
    }
  })
  return { cli, api }
}

/** CLI çıktısında abonelik/oran limiti mesajı var mı? */
export function looksLikeLimit(output: string): boolean {
  const tail = output.slice(-3000)
  return /usage limit|rate[ -]?limit|limit (has been )?reached|reached your .*limit|quota (exceeded|exhausted)|exceeded your|too many requests|\b429\b|limit will reset|resets? at \d|out of credits|insufficient (credits|quota)|hit your .{0,30}limit|\d+-hour limit|weekly limit|limit\W{0,5}resets?/i.test(
    tail
  )
}
