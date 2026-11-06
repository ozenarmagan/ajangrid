import { useEffect, useMemo, useRef, useState } from 'react'
import type { Agent, Theme } from '../../../shared/types'
import { AgentHeader } from '../components/AgentHeader'
import { Stop } from '../components/Icons'
import { LivePanel } from '../components/LivePanel'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { duration, stripAnsi, timeOf } from '../util'
import { ManagerPanel } from './ManagerPanel'

interface Props {
  agentId: string | null
  theme: Theme
  onOpenGrid: () => void
  onEditAgent: (id: string) => void
}

/** Yönetici olmayan bir ajanla doğrudan çalışma (görev ver, çıktıyı gör). */
function DirectChat({ agent, onEdit }: { agent: Agent; onEdit: () => void }): React.JSX.Element {
  const { runs, outputOf, outputTick, startRun } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const [text, setText] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const myRuns = useMemo(
    () => runs.filter((r) => r.agentId === agent.id && !r.orchId),
    [runs, agent.id]
  )
  const running = runs.filter((r) => r.agentId === agent.id && r.status === 'running')

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [outputTick, myRuns.length])

  // "@Ad görev" yazılırsa görevi o ajana yönlendir
  const send = async (): Promise<void> => {
    const raw = text.trim()
    if (!raw) return
    let target = agent
    let prompt = raw
    const m = raw.match(/^@(\S+)\s+([\s\S]+)$/)
    if (m) {
      const key = m[1].toLocaleLowerCase('tr')
      const hit = agents.find((a) => a.name.toLocaleLowerCase('tr').replace(/\s+/g, '') === key)
      if (hit) {
        target = hit
        prompt = m[2]
      }
    }
    setText('')
    await startRun(target.id, prompt)
  }

  return (
    <main
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--w08)'
      }}
    >
      <AgentHeader
        agent={agent}
        onEdit={onEdit}
        extra={
          running.length ? (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => running.forEach((r) => window.api.runs.stop(r.id))}
            >
              <Stop size={12} /> Durdur
            </button>
          ) : null
        }
      />
      <div
        ref={scroller}
        className="scroll"
        style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {!myRuns.length ? (
          <div
            className="muted"
            style={{ margin: 'auto', textAlign: 'center', maxWidth: 420, lineHeight: 1.6 }}
          >
            {agent.name} ajanına doğrudan görev ver. Yöneticinin verdiği görevler yöneticinin
            ekranında görünür.
          </div>
        ) : null}
        {myRuns.map((r) => {
          const out = stripAnsi(outputOf(r.id)).trim()
          return (
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ alignSelf: 'flex-end', maxWidth: '78%' }} className="bubble-user">
                {r.prompt}
              </div>
              <div style={{ maxWidth: '88%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="hint">
                  {agent.name} · {timeOf(r.startedAt)} · {duration(r)} ·{' '}
                  <span
                    style={{
                      color:
                        r.status === 'error'
                          ? 'var(--red-fg)'
                          : r.status === 'running'
                            ? 'var(--green-fg)'
                            : 'var(--muted)'
                    }}
                  >
                    {r.limitHit
                      ? 'limit doldu'
                      : r.status === 'running'
                        ? 'çalışıyor'
                        : r.status === 'done'
                          ? 'tamamlandı'
                          : r.status === 'stopped'
                            ? 'durduruldu'
                            : 'hata'}
                  </span>
                  {r.via ? <span> · {r.via}</span> : null}
                  {r.usage?.costUsd !== undefined ? (
                    <span> · ~${r.usage.costUsd.toFixed(4)}</span>
                  ) : null}
                </div>
                <div className="bubble-agent">
                  {out || (r.status === 'running' ? '…' : '(çıktı yok)')}
                </div>
                <div className="mono hint" style={{ fontSize: 11 }} title={r.commandLine}>
                  {r.commandLine.split('\n')[0].slice(0, 140)}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '12px 22px 18px' }}>
        <div
          style={{
            border: '1px solid var(--w12)',
            borderRadius: 14,
            background: 'var(--panel)',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
          <label htmlFor="composer" className="sr">
            Görev
          </label>
          <textarea
            id="composer"
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                send()
              }
            }}
            placeholder={`${agent.name} ajanına görev ver… (@AjanAdı ile başka ajana · Ctrl/⌘+Enter gönderir)`}
            className="composer"
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8
            }}
          >
            <span className="hint">
              Çalışma klasörü: <span className="mono">{agent.workdir || team?.workdir}</span>
            </span>
            <button className="btn btn-p" onClick={send} disabled={!text.trim()}>
              Gönder
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export function CommandCenter({
  agentId,
  theme,
  onOpenGrid,
  onEditAgent
}: Props): React.JSX.Element {
  const { data, orchs } = useStore()
  const agents = useTeamAgents()
  const agent = agents.find((a) => a.id === agentId) ?? agents.find((a) => a.isManager) ?? agents[0]

  if (!agent || !data) {
    return (
      <main
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        className="muted"
      >
        Bu ekipte ajan yok. Soldaki + ile bir ajan oluştur ya da şablondan ekip kur.
      </main>
    )
  }

  // Yönetici ekranında sağ panel, döngüde o an çalışan ajanı izler
  let liveAgent = agent
  if (agent.isManager) {
    const active = [...orchs]
      .reverse()
      .find((o) => o.teamId === agent.teamId && (o.status === 'running' || o.status === 'waiting'))
    const step = active
      ? [...active.steps].reverse().find((s) => s.status === 'running' && s.agentId)
      : undefined
    liveAgent = agents.find((a) => a.id === step?.agentId) ?? agent
  }

  return (
    <>
      {agent.isManager ? (
        <ManagerPanel manager={agent} onEdit={() => onEditAgent(agent.id)} />
      ) : (
        <DirectChat agent={agent} onEdit={() => onEditAgent(agent.id)} />
      )}
      <LivePanel agent={liveAgent} theme={theme} onOpenGrid={onOpenGrid} />
    </>
  )
}
