import { API_LABELS, CLI_LABELS, type Agent, type AppData, type RunInfo } from '../../shared/types'

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007|\r(?!\n)/g

export function stripAnsi(s: string): string {
  return s.replace(ANSI, '')
}

export function engineBadge(agent: Agent): { cls: string; text: string } {
  if (agent.engine === 'api') return { cls: 'b-api', text: 'API' }
  if (agent.engine === 'local') return { cls: 'b-loc', text: 'Yerel' }
  return { cls: 'b-cli', text: 'CLI' }
}

export function engineLine(agent: Agent, data?: AppData | null): string {
  if (agent.engine === 'api') {
    return `${API_LABELS[agent.apiProvider ?? 'anthropic']} API · ${agent.model || 'model seçilmedi'}`
  }
  if (agent.engine === 'local') {
    const tool = data?.localTools.find((t) => t.id === agent.localToolId)
    return `Yerel · ${tool?.name ?? 'araç seçilmedi'}`
  }
  return `${CLI_LABELS[agent.cli ?? 'claude']} · ${agent.model || 'varsayılan model'}`
}

export interface AgentState {
  key: 'idle' | 'running' | 'done' | 'error' | 'stopped'
  label: string
  dot: string
  fg: string
}

export function agentState(agentId: string, runs: RunInfo[]): AgentState {
  const mine = runs.filter((r) => r.agentId === agentId)
  if (mine.some((r) => r.status === 'running'))
    return { key: 'running', label: 'Çalışıyor', dot: '#34d399', fg: 'var(--green-fg)' }
  const last = mine[mine.length - 1]
  if (!last) return { key: 'idle', label: 'Boşta', dot: '#71717a', fg: 'var(--muted)' }
  if (last.status === 'error')
    return { key: 'error', label: 'Hata', dot: '#f87171', fg: 'var(--red-fg)' }
  if (last.status === 'stopped')
    return { key: 'stopped', label: 'Durduruldu', dot: '#fbbf24', fg: 'var(--amber-fg)' }
  return { key: 'done', label: 'Tamamlandı', dot: '#a78bfa', fg: 'var(--violet-fg)' }
}

export function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toLocaleUpperCase('tr')
}

export function duration(r: RunInfo): string {
  const ms = (r.endedAt ?? Date.now()) - r.startedAt
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sn`
  return `${Math.floor(s / 60)} dk ${String(s % 60).padStart(2, '0')} sn`
}

export function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const AGENT_COLORS = [
  '#c4b5fd',
  '#93c5fd',
  '#f9a8d4',
  '#fcd34d',
  '#6ee7b7',
  '#fdba74',
  '#67e8f9',
  '#bef264'
]

export function cleanError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err)
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export function blankAgent(index: number): Agent {
  return {
    id: '',
    name: '',
    title: '',
    role: '',
    isManager: false,
    color: AGENT_COLORS[index % AGENT_COLORS.length],
    engine: 'cli',
    cli: 'claude',
    apiProvider: 'anthropic',
    model: 'sonnet',
    effort: 'medium',
    permissions: { write: true, shell: false, network: false },
    createdAt: 0
  }
}
