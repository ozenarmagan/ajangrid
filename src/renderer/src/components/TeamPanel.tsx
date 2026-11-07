import { useEffect, useRef, useState } from 'react'
import type { Agent, RunInfo, Theme, WorkdirEntry } from '../../../shared/types'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { agentState, duration, engineLine, fileSize, initialOf, stripAnsi } from '../util'
import { AgentTerminal } from './AgentTerminal'
import { FilePreview } from './FilePreview'
import { File, Folder, Refresh, Stop } from './Icons'

/** Ajan çıktısını okunur hale getirir: renk kodları ve sistem satırları atılır. */
function readable(out: string): string {
  return stripAnsi(out)
    .split(/\r?\n/)
    .filter((l) => !/^\[(çıkış kodu|istek gönderildi|token|kaydedildi)[^\]]*\]$/.test(l.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function lastLines(text: string, n: number): string {
  const lines = text.split('\n').filter((l) => l.trim())
  return lines.slice(-n).join('\n')
}

function statusText(r: RunInfo | undefined, fallback: string): string {
  if (!r) return fallback
  if (r.limitHit) return 'Limit doldu'
  return { running: 'Çalışıyor', done: 'Tamamlandı', error: 'Hata', stopped: 'Durduruldu' }[
    r.status
  ]
}

function AgentCard({
  agent,
  open,
  onToggle,
  onEdit,
  theme
}: {
  agent: Agent
  open: boolean
  onToggle: () => void
  onEdit: () => void
  theme: Theme
}): React.JSX.Element {
  const { data, runs, outputOf } = useStore()
  const [raw, setRaw] = useState(false)
  const mine = runs.filter((r) => r.agentId === agent.id).sort((a, b) => a.startedAt - b.startedAt)
  const last = mine[mine.length - 1]
  const st = agentState(agent.id, runs)
  const text = last ? readable(outputOf(last.id)) : ''
  const preRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight
  }, [open, text])

  return (
    <div
      className="card"
      style={{
        gap: 8,
        padding: 12,
        borderColor:
          st.key === 'running' ? 'rgba(52,211,153,.45)' : open ? 'rgba(139,92,246,.45)' : undefined
      }}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10
        }}
      >
        <span className="avatar" style={{ background: agent.color, width: 28, height: 28 }}>
          {initialOf(agent.name)}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{agent.name}</span>
            <span style={{ fontSize: 12, color: st.fg, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
              {statusText(last, 'Boşta')}
              {last ? ` · ${duration(last)}` : ''}
            </span>
          </span>
          <span
            className="hint"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {engineLine(agent, data)}
          </span>
        </span>
      </button>

      {last ? (
        <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.45 }}>
          <span className="muted">Görev: </span>
          {open
            ? last.prompt
            : last.prompt.length > 140
              ? last.prompt.slice(0, 140) + '…'
              : last.prompt}
        </div>
      ) : (
        <div className="hint">{agent.title || 'Henüz görev almadı.'}</div>
      )}

      {last && !open && text ? (
        <div
          className="term mono pre"
          style={{
            padding: '6px 8px',
            fontSize: 11.5,
            color: 'var(--text3)',
            maxHeight: 64,
            overflow: 'hidden'
          }}
        >
          {lastLines(text, 3)}
        </div>
      ) : null}

      {open ? (
        <>
          {raw ? (
            <div className="term" style={{ height: 300, overflow: 'hidden' }}>
              <AgentTerminal agentId={agent.id} theme={theme} fontSize={11.5} />
            </div>
          ) : (
            <div
              ref={preRef}
              className="term pre"
              style={{
                padding: '10px 12px',
                fontSize: 13,
                color: 'var(--text2)',
                maxHeight: 320,
                overflow: 'auto'
              }}
            >
              {text || (last?.status === 'running' ? 'Çalışıyor…' : 'Çıktı yok.')}
            </div>
          )}
          {last?.via ? <div className="hint">{last.via}</div> : null}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => setRaw(!raw)}>
              {raw ? 'Okunur görünüm' : 'Ham terminal'}
            </button>
            <button className="btn btn-sm" onClick={onEdit}>
              Ayarlar
            </button>
            {last?.status === 'running' ? (
              <button
                className="btn btn-sm btn-danger"
                onClick={() => window.api.runs.stop(last.id)}
              >
                <Stop size={12} /> Durdur
              </button>
            ) : null}
            {mine.length > 1 ? (
              <span className="hint" style={{ alignSelf: 'center' }}>
                {mine.length} çalışma
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Files(): React.JSX.Element {
  const { runs } = useStore()
  const team = useActiveTeam()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const [dir, setDir] = useState('')
  const [files, setFiles] = useState<WorkdirEntry[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const finished = runs.filter((r) => r.status !== 'running').length

  useEffect(() => {
    if (!team) return
    let cancelled = false
    window.api.fs.list(team.id, dir).then((list) => {
      if (!cancelled) setFiles(list)
    })
    return () => {
      cancelled = true
    }
  }, [team, finished, open, tick, dir])

  const up = (): void => setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '')

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          className="linkbtn"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'} Dosyalar
        </button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="ib" aria-label="Yenile" onClick={() => setTick((t) => t + 1)}>
            <Refresh />
          </button>
          <button
            className="ib"
            aria-label="Klasörü Finder'da aç"
            onClick={() => team && window.api.fs.open(team.id, dir)}
          >
            <Folder />
          </button>
        </div>
      </div>
      {open ? (
        <>
          {dir ? (
            <button className="linkbtn" onClick={up}>
              ← {dir}
            </button>
          ) : null}
          <div
            className="scroll"
            style={{ maxHeight: 280, display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {files.map((f) => (
              <button
                key={f.relPath}
                className="nav"
                style={{ border: '1px solid var(--w08)', justifyContent: 'space-between' }}
                onClick={() => (f.isDir ? setDir(f.relPath) : setPreview(f.relPath))}
                title={f.isDir ? 'Klasöre gir' : 'Önizle'}
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
                <span className="hint">{f.isDir ? '›' : fileSize(f.size)}</span>
              </button>
            ))}
            {!files.length ? <div className="hint">Klasör boş.</div> : null}
          </div>
        </>
      ) : null}
      {preview && team ? (
        <FilePreview teamId={team.id} rel={preview} onClose={() => setPreview(null)} />
      ) : null}
    </section>
  )
}

/** Sağ panel: alt ajanların ne yaptığı, okunur biçimde. */
export function TeamPanel({
  focusId,
  setFocusId,
  onEditAgent,
  theme
}: {
  focusId: string | null
  setFocusId: (id: string | null) => void
  onEditAgent: (id: string) => void
  theme: Theme
}): React.JSX.Element {
  const agents = useTeamAgents().filter((a) => !a.isManager)
  const { runs } = useStore()
  const busy = runs.filter(
    (r) => r.status === 'running' && agents.some((a) => a.id === r.agentId)
  ).length

  return (
    <aside
      aria-label="Ekip"
      className="scroll"
      style={{
        width: 400,
        flexShrink: 0,
        height: '100%',
        boxSizing: 'border-box',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        background: 'var(--side)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="h2">Ekip</h2>
        <span className="hint">{busy ? `${busy} ajan çalışıyor` : `${agents.length} ajan`}</span>
      </div>
      {!agents.length ? (
        <div className="hint" style={{ lineHeight: 1.6 }}>
          Henüz alt ajan yok. Yöneticiye hedefini yaz; gereken ajanları önerir, onaylarsan
          oluşturulur.
        </div>
      ) : null}
      {agents.map((a) => (
        <AgentCard
          key={a.id}
          agent={a}
          open={focusId === a.id}
          onToggle={() => setFocusId(focusId === a.id ? null : a.id)}
          onEdit={() => onEditAgent(a.id)}
          theme={theme}
        />
      ))}
      <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: '1px solid var(--w08)' }}>
        <Files />
      </div>
    </aside>
  )
}
