import { useEffect, useState } from 'react'
import type { Agent, Theme, WorkdirEntry } from '../../../shared/types'
import { useActiveTeam, useStore } from '../store'
import { fileSize } from '../util'
import { AgentTerminal } from './AgentTerminal'
import { File, Folder, Refresh } from './Icons'

/** Sağ panel: bir ajanın canlı terminali + ekip çalışma klasörü. */
export function LivePanel({
  agent,
  theme,
  onOpenGrid
}: {
  agent: Agent
  theme: Theme
  onOpenGrid: () => void
}): React.JSX.Element {
  const { runs } = useStore()
  const team = useActiveTeam()
  const [files, setFiles] = useState<WorkdirEntry[]>([])
  const [outputsDir, setOutputsDir] = useState<WorkdirEntry[]>([])
  const finishedCount = runs.filter((r) => r.status !== 'running').length

  useEffect(() => {
    if (!team) return
    let cancelled = false
    Promise.all([window.api.fs.list(team.id, ''), window.api.fs.list(team.id, 'outputs')]).then(
      ([a, b]) => {
        if (cancelled) return
        setFiles(a)
        setOutputsDir(b)
      }
    )
    return () => {
      cancelled = true
    }
  }, [team, finishedCount])

  const refresh = (): void => {
    if (!team) return
    window.api.fs.list(team.id, '').then(setFiles)
    window.api.fs.list(team.id, 'outputs').then(setOutputsDir)
  }

  const rows = [
    ...outputsDir.map((f) => ({ ...f, name: `outputs/${f.name}` })),
    ...files.filter((f) => f.name !== 'outputs')
  ].slice(0, 20)

  return (
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
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 50%', minHeight: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="h2">{agent.name} · canlı</h2>
          <button className="btn btn-sm" onClick={onOpenGrid}>
            Izgarada aç
          </button>
        </div>
        <div className="term" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <AgentTerminal key={agent.id} agentId={agent.id} theme={theme} fontSize={11.5} />
        </div>
      </section>

      <section
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 40%', minHeight: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 className="h2">Çalışma klasörü</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="ib" aria-label="Yenile" onClick={refresh}>
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
          {rows.map((f) => (
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
          {!rows.length ? (
            <div className="hint">Klasör boş. Ajanların ürettiği dosyalar burada görünür.</div>
          ) : null}
        </div>
      </section>
    </aside>
  )
}
