import { useEffect, useMemo, useRef, useState } from 'react'
import { EFFORT_LABELS, type Agent, type Theme, type WorkdirEntry } from '../../../shared/types'
import { AgentTerminal } from '../components/AgentTerminal'
import { File, Folder, Refresh, Stop } from '../components/Icons'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import {
  agentState,
  duration,
  engineBadge,
  engineLine,
  fileSize,
  initialOf,
  stripAnsi,
  timeOf
} from '../util'

interface Props {
  agentId: string | null
  theme: Theme
  onOpenGrid: () => void
  onEditAgent: (id: string) => void
}

export function CommandCenter({
  agentId,
  theme,
  onOpenGrid,
  onEditAgent
}: Props): React.JSX.Element {
  const { data, runs, outputOf, outputTick, startRun } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const agent = agents.find((a) => a.id === agentId) ?? agents.find((a) => a.isManager) ?? agents[0]
  const [text, setText] = useState('')
  const [files, setFiles] = useState<WorkdirEntry[]>([])
  const [outputsDir, setOutputsDir] = useState<WorkdirEntry[]>([])
  const scroller = useRef<HTMLDivElement>(null)

  const myRuns = useMemo(() => runs.filter((r) => r.agentId === agent?.id), [runs, agent?.id])
  const running = myRuns.filter((r) => r.status === 'running')

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [outputTick, myRuns.length])

  const refreshFiles = (): void => {
    if (!team) return
    window.api.fs.list(team.id, '').then(setFiles)
    window.api.fs.list(team.id, 'outputs').then(setOutputsDir)
  }
  useEffect(refreshFiles, [team?.id, runs.length])
  // Bir çalışma bittiğinde dosya listesini tazele
  const finishedCount = runs.filter((r) => r.status !== 'running').length
  useEffect(refreshFiles, [finishedCount])

  if (!agent || !data) {
    return (
      <main
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        className="muted"
      >
        Bu ekipte ajan yok. Soldaki + ile bir ajan oluştur.
      </main>
    )
  }

  // "@Ad görev" yazılırsa görevi o ajana yönlendir
  const resolveTarget = (raw: string): { target: Agent; prompt: string } => {
    const m = raw.match(/^@(\S+)\s+([\s\S]+)$/)
    if (m) {
      const hit = agents.find(
        (a) => a.name.toLocaleLowerCase('tr').replace(/\s+/g, '') === m[1].toLocaleLowerCase('tr')
      )
      if (hit) return { target: hit, prompt: m[2] }
    }
    return { target: agent, prompt: raw }
  }

  const send = async (): Promise<void> => {
    const raw = text.trim()
    if (!raw) return
    const { target, prompt } = resolveTarget(raw)
    setText('')
    await startRun(target.id, prompt)
  }

  const badge = engineBadge(agent)
  const st = agentState(agent.id, runs)
  const fileRows = [
    ...outputsDir.map((f) => ({ ...f, name: `outputs/${f.name}` })),
    ...files.filter((f) => f.name !== 'outputs')
  ].slice(0, 14)

  return (
    <>
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
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 22px',
            borderBottom: '1px solid var(--w08)',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="avatar" style={{ background: agent.color, width: 34, height: 34 }}>
              {initialOf(agent.name)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontWeight: 600 }}>
                {agent.name}{' '}
                <span style={{ fontSize: 12, fontWeight: 400, color: st.fg }}>· {st.label}</span>
              </span>
              <span className="hint">{agent.title || engineLine(agent, data)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className={`badge ${badge.cls}`}>{engineLine(agent, data)}</span>
            {agent.engine !== 'local' ? (
              <span className="badge b-amber">
                Efor: {EFFORT_LABELS[agent.effort].toLocaleLowerCase('tr')}
              </span>
            ) : null}
            <button className="btn btn-sm" onClick={() => onEditAgent(agent.id)}>
              Düzenle
            </button>
            {running.length ? (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => running.forEach((r) => window.api.runs.stop(r.id))}
              >
                <Stop size={12} /> Durdur
              </button>
            ) : null}
          </div>
        </header>

        <div
          ref={scroller}
          className="scroll"
          style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          {agent.isManager ? (
            <div
              className="hint"
              style={{ border: '1px dashed var(--w12)', borderRadius: 10, padding: '10px 12px' }}
            >
              Otonom yönetici döngüsü (planlama, alt ajanlara dağıtma, denetim) bir sonraki sürümde
              geliyor. Şimdilik görev seçili ajana doğrudan gider; başka bir ajana göndermek için{' '}
              <span className="mono">@AjanAdı görev</span> yaz.
            </div>
          ) : null}
          {!myRuns.length ? (
            <div className="muted" style={{ margin: 'auto', textAlign: 'center' }}>
              {agent.name} ajanına ilk görevini ver.
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
                      {r.status === 'running'
                        ? 'çalışıyor'
                        : r.status === 'done'
                          ? 'tamamlandı'
                          : r.status === 'stopped'
                            ? 'durduruldu'
                            : 'hata'}
                    </span>
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
            <label
              htmlFor="composer"
              style={{
                position: 'absolute',
                width: 1,
                height: 1,
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)'
              }}
            >
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
              placeholder={`${agent.name} ajanına görev ver… (@AjanAdı ile başka ajana yönlendir · Ctrl/⌘+Enter gönderir)`}
              style={{
                font: 'inherit',
                fontSize: 14,
                background: 'transparent',
                border: 0,
                outline: 'none',
                color: 'var(--text)',
                resize: 'none',
                padding: '4px'
              }}
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

      <aside
        aria-label="Canlı durum"
        style={{
          width: 360,
          flexShrink: 0,
          height: '100%',
          boxSizing: 'border-box',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
          background: 'var(--side)'
        }}
      >
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flex: '1 1 50%',
            minHeight: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="h2">{agent.name} · canlı</h2>
            <button className="btn btn-sm" onClick={onOpenGrid}>
              Izgarada aç
            </button>
          </div>
          <div className="term" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <AgentTerminal agentId={agent.id} theme={theme} fontSize={11.5} />
          </div>
        </section>

        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flex: '1 1 40%',
            minHeight: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="h2">Çalışma klasörü</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="ib" aria-label="Yenile" onClick={refreshFiles}>
                <Refresh />
              </button>
              <button
                className="ib"
                aria-label="Klasörü aç"
                onClick={() => team && window.api.fs.open(team.id, '')}
              >
                <Folder />
              </button>
            </div>
          </div>
          <div className="scroll" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {fileRows.map((f) => (
              <button
                key={f.relPath}
                className="nav"
                style={{ border: '1px solid var(--w08)', justifyContent: 'space-between' }}
                onClick={() => team && window.api.fs.open(team.id, f.relPath)}
                title="Aç"
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  {f.isDir ? <Folder /> : <File />}
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {f.name}
                  </span>
                </span>
                <span className="hint">{f.isDir ? '' : fileSize(f.size)}</span>
              </button>
            ))}
            {!fileRows.length ? (
              <div className="hint">Klasör boş. Ajanların ürettiği dosyalar burada görünür.</div>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  )
}
