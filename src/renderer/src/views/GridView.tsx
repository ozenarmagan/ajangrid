import { useState } from 'react'
import type { Theme } from '../../../shared/types'
import { AgentTerminal } from '../components/AgentTerminal'
import { Expand, Shrink, Stop } from '../components/Icons'
import { useStore, useTeamAgents } from '../store'
import { agentState, engineBadge, engineLine } from '../util'

const LAYOUTS = [
  { id: 'auto', label: 'Otomatik' },
  { id: '2', label: '2 sütun' },
  { id: '3', label: '3 sütun' }
] as const

export function GridView({ theme }: { theme: Theme }): React.JSX.Element {
  const { data, runs, startRun, orchs } = useStore()
  const agents = useTeamAgents()
  const [layout, setLayout] = useState<(typeof LAYOUTS)[number]['id']>('auto')
  const [maxId, setMaxId] = useState<string | null>(null)
  const [broadcast, setBroadcast] = useState('')

  const shown = maxId ? agents.filter((a) => a.id === maxId) : agents
  const cols = maxId
    ? 1
    : layout === 'auto'
      ? shown.length <= 1
        ? 1
        : shown.length <= 4
          ? 2
          : 3
      : Number(layout)
  const rows = Math.max(1, Math.ceil(shown.length / cols))
  const anyRunning = runs.some((r) => r.status === 'running')

  const teamId = agents[0]?.teamId
  const active = [...orchs]
    .reverse()
    .find((o) => o.teamId === teamId && (o.status === 'running' || o.status === 'waiting'))
  const lastTask = active ? [...active.steps].reverse().find((s) => s.kind === 'task') : undefined
  const banner = active
    ? active.status === 'waiting'
      ? 'Yönetici senden yanıt bekliyor (Komuta Merkezi).'
      : lastTask
        ? `${agents.find((a) => a.id === lastTask.agentId)?.name ?? 'Ajan'}: ${lastTask.task?.slice(0, 160)}`
        : 'Yönetici planlıyor…'
    : null

  const sendAll = async (): Promise<void> => {
    const t = broadcast.trim()
    if (!t) return
    setBroadcast('')
    for (const a of agents) await startRun(a.id, t)
  }

  return (
    <main
      style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '10px 18px',
          borderBottom: '1px solid var(--w08)',
          flexWrap: 'wrap'
        }}
      >
        <div className="seg-group" role="group" aria-label="Düzen" style={{ width: 300 }}>
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              className={`seg ${layout === l.id ? 'on' : ''}`}
              onClick={() => setLayout(l.id)}
              aria-pressed={layout === l.id}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flex: 1,
            justifyContent: 'flex-end',
            minWidth: 300
          }}
        >
          <label
            htmlFor="bc"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)'
            }}
          >
            Tüm ajanlara gönder
          </label>
          <input
            id="bc"
            className="inp"
            style={{ maxWidth: 420 }}
            value={broadcast}
            onChange={(e) => setBroadcast(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendAll()}
            placeholder="Aynı görevi ekipteki tüm ajanlara gönder…"
          />
          <button className="btn" onClick={sendAll} disabled={!broadcast.trim()}>
            Tümüne yayınla
          </button>
          <button
            className="btn btn-danger"
            onClick={() => window.api.runs.stopAll()}
            disabled={!anyRunning}
          >
            Tümünü durdur
          </button>
        </div>
      </header>

      {banner ? (
        <div
          style={{
            padding: '8px 18px',
            borderBottom: '1px solid var(--w06)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--text3)'
          }}
        >
          <span className="badge b-cli">Yönetici</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {banner}
          </span>
        </div>
      ) : null}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '12px 18px 18px',
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: 12
        }}
      >
        {shown.map((a) => {
          const st = agentState(a.id, runs)
          const b = engineBadge(a)
          const live = runs.filter((r) => r.agentId === a.id && r.status === 'running')
          const border =
            st.key === 'running'
              ? 'rgba(52,211,153,.45)'
              : st.key === 'error'
                ? 'rgba(248,113,113,.45)'
                : 'var(--w08)'
          return (
            <section
              key={a.id}
              style={{
                minWidth: 0,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 12,
                background: 'var(--term)',
                border: `1px solid ${border}`,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px 6px 10px',
                  background: 'var(--panel)',
                  borderBottom: '1px solid var(--w08)'
                }}
              >
                <span className="dot" style={{ background: st.dot }} title={st.label} />
                <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                  {a.name}
                </span>
                <span className={`badge ${b.cls}`}>{b.text}</span>
                <span
                  className="muted"
                  style={{
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    flex: 1
                  }}
                >
                  {engineLine(a, data)}
                </span>
                <button
                  className="ib"
                  aria-label={maxId ? 'Küçült' : 'Büyüt'}
                  onClick={() => setMaxId(maxId ? null : a.id)}
                >
                  {maxId ? <Shrink /> : <Expand />}
                </button>
                <button
                  className="ib"
                  aria-label="Durdur"
                  disabled={!live.length}
                  onClick={() => live.forEach((r) => window.api.runs.stop(r.id))}
                >
                  <Stop />
                </button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                <AgentTerminal agentId={a.id} theme={theme} />
              </div>
            </section>
          )
        })}
        {!shown.length ? <div className="muted">Bu ekipte ajan yok.</div> : null}
      </div>
    </main>
  )
}
