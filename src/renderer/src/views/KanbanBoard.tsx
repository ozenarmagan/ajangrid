import { useState } from 'react'
import type { Agent, Orchestration, RunInfo } from '../../../shared/types'
import { useStore, useTeamAgents } from '../store'
import { duration, initialOf, timeOf } from '../util'

type Col = 'waiting' | 'running' | 'done' | 'problem'

interface Card {
  id: string
  col: Col
  agent?: Agent
  title: string
  meta: string
  goal?: string
  at: number
  note?: string
}

const COLS: Array<{ id: Col; label: string; dot: string }> = [
  { id: 'waiting', label: 'Onay bekliyor', dot: '#fbbf24' },
  { id: 'running', label: 'Çalışıyor', dot: '#34d399' },
  { id: 'done', label: 'Tamamlandı', dot: '#a78bfa' },
  { id: 'problem', label: 'Hata / durduruldu', dot: '#f87171' }
]

function colOf(status: RunInfo['status'] | undefined, limit?: boolean): Col {
  if (limit) return 'problem'
  if (status === 'running') return 'running'
  if (status === 'done') return 'done'
  return 'problem'
}

function short(s: string, n = 60): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** Yönetici döngülerindeki görevleri ve doğrudan görevleri sütunlara dağıtır. */
function buildCards(
  orchs: Orchestration[],
  runs: RunInfo[],
  agents: Agent[],
  filter: string
): Card[] {
  const cards: Card[] = []
  const byId = (id?: string): Agent | undefined => agents.find((a) => a.id === id)
  const runOf = (id?: string): RunInfo | undefined => runs.find((r) => r.id === id)

  for (const o of orchs) {
    if (filter !== 'all' && filter !== o.id) continue
    for (const s of o.steps) {
      if (s.kind === 'manager' && s.status === 'running' && o.status === 'running') {
        cards.push({
          id: s.id,
          col: 'running',
          agent: byId(s.agentId),
          title: 'Sonraki adımı planlıyor',
          meta: timeOf(s.at),
          goal: o.goal,
          at: s.at
        })
      }
      if (s.kind !== 'task') continue
      const r = runOf(s.runId)
      cards.push({
        id: s.id,
        col: colOf(s.status, r?.limitHit),
        agent: byId(s.agentId),
        title: s.task ?? '',
        meta: r ? `${timeOf(r.startedAt)} · ${duration(r)}` : timeOf(s.at),
        goal: o.goal,
        at: s.at,
        note: r?.limitHit ? 'Limit doldu' : r?.via
      })
    }
    const q = o.question
    if (o.status === 'waiting' && q) {
      if (q.kind === 'approval' && q.pending) {
        q.pending.forEach((p, i) =>
          cards.push({
            id: `${q.id}-${i}`,
            col: 'waiting',
            agent: byId(p.agentId),
            title: p.task,
            meta: 'Onayını bekliyor',
            goal: o.goal,
            at: Date.now()
          })
        )
      } else {
        cards.push({
          id: q.id,
          col: 'waiting',
          agent: byId(o.managerId),
          title:
            q.kind === 'team'
              ? `Ekip önerisi: ${q.proposals?.length ?? 0} yeni ajan`
              : short(q.text, 160),
          meta: q.kind === 'limit' ? 'Limit doldu, yanıtını bekliyor' : 'Yanıtını bekliyor',
          goal: o.goal,
          at: Date.now()
        })
      }
    }
  }

  // Yönetici dışında doğrudan verilen görevler
  if (filter === 'all') {
    for (const r of runs) {
      if (r.orchId || !agents.some((a) => a.id === r.agentId)) continue
      cards.push({
        id: r.id,
        col: colOf(r.status, r.limitHit),
        agent: byId(r.agentId),
        title: r.prompt,
        meta: `${timeOf(r.startedAt)} · ${duration(r)} · doğrudan`,
        at: r.startedAt,
        note: r.limitHit ? 'Limit doldu' : undefined
      })
    }
  }
  return cards.sort((a, b) => b.at - a.at)
}

export function KanbanBoard({
  teamId,
  onFocusAgent,
  onOpenFlow
}: {
  teamId: string
  onFocusAgent: (id: string) => void
  onOpenFlow: () => void
}): React.JSX.Element {
  const { orchs, runs } = useStore()
  const agents = useTeamAgents()
  const mine = orchs.filter((o) => o.teamId === teamId)
  const latest = mine[mine.length - 1]
  const [filter, setFilter] = useState<string>(latest?.id ?? 'all')
  const effective = filter === 'all' || mine.some((o) => o.id === filter) ? filter : 'all'
  const cards = buildCards(mine, runs, agents, effective)

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 18px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="lbl" htmlFor="kanban-filter">
          Gösterilen hedef
        </label>
        <select
          id="kanban-filter"
          className="inp"
          style={{ maxWidth: 520, minHeight: 32, padding: '4px 8px', fontSize: 13 }}
          value={effective}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">Tümü (doğrudan görevler dahil)</option>
          {[...mine].reverse().map((o) => (
            <option key={o.id} value={o.id}>
              {timeOf(o.startedAt)} · {short(o.goal, 70)}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 10
        }}
      >
        {COLS.map((c) => {
          const list = cards.filter((k) => k.col === c.id)
          return (
            <section
              key={c.id}
              aria-label={c.label}
              style={{
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--w03)',
                border: '1px solid var(--w08)',
                borderRadius: 12
              }}
            >
              <header
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px' }}
              >
                <span className="dot" style={{ background: c.dot }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.label}</span>
                <span className="hint" style={{ marginLeft: 'auto' }}>
                  {list.length}
                </span>
              </header>
              <div
                className="scroll"
                style={{
                  flex: 1,
                  padding: '0 8px 8px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}
              >
                {list.map((k) => (
                  <button
                    key={k.id}
                    className="card"
                    onClick={() =>
                      c.id === 'waiting'
                        ? onOpenFlow()
                        : k.agent && !k.agent.isManager
                          ? onFocusAgent(k.agent.id)
                          : onOpenFlow()
                    }
                    style={{
                      padding: 10,
                      gap: 6,
                      textAlign: 'left',
                      cursor: 'pointer',
                      font: 'inherit',
                      color: 'inherit'
                    }}
                    title={c.id === 'waiting' ? 'Akışta yanıtla' : 'Ajanın çıktısını göster'}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        className="avatar"
                        style={{
                          background: k.agent?.color ?? '#71717a',
                          width: 22,
                          height: 22,
                          fontSize: 11
                        }}
                      >
                        {initialOf(k.agent?.name ?? '?')}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 12.5 }}>
                        {k.agent?.name ?? 'Ajan'}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        color: 'var(--text2)',
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {k.title}
                    </span>
                    {k.note ? (
                      <span className="hint" style={{ color: 'var(--amber-fg)' }}>
                        {k.note}
                      </span>
                    ) : null}
                    <span className="hint" style={{ fontSize: 11.5 }}>
                      {k.meta}
                      {effective === 'all' && k.goal ? ` · ${short(k.goal, 40)}` : ''}
                    </span>
                  </button>
                ))}
                {!list.length ? (
                  <div className="hint" style={{ padding: '6px 4px' }}>
                    —
                  </div>
                ) : null}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
