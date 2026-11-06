import { useState } from 'react'
import type { Theme } from '../../../shared/types'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { agentState, engineLine, initialOf } from '../util'
import { Logo, Moon, Plus, Sun } from './Icons'

export type View = 'command' | 'grid' | 'agents' | 'engines'

const NAV: Array<{ id: View; label: string }> = [
  { id: 'command', label: 'Komuta Merkezi' },
  { id: 'grid', label: 'Terminal Izgarası' },
  { id: 'agents', label: 'Ajanlar' },
  { id: 'engines', label: 'Motorlar ve Limitler' }
]

interface Props {
  view: View
  setView: (v: View) => void
  selectedAgentId: string | null
  onSelectAgent: (id: string) => void
  onNewAgent: () => void
}

export function Sidebar({
  view,
  setView,
  selectedAgentId,
  onSelectAgent,
  onNewAgent
}: Props): React.JSX.Element {
  const { data, runs } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const [addingTeam, setAddingTeam] = useState(false)
  const [teamName, setTeamName] = useState('')
  const theme: Theme = data?.settings.theme ?? 'dark'

  const toggleTheme = (): void => {
    window.api.settings.set({ theme: theme === 'dark' ? 'light' : 'dark' })
  }

  const addTeam = async (): Promise<void> => {
    const name = teamName.trim()
    if (!name) return
    const dir = await window.api.dialog.pickFolder()
    if (!dir) return
    const t = await window.api.teams.save({ id: '', name, workdir: dir })
    await window.api.settings.set({ activeTeamId: t.id })
    setTeamName('')
    setAddingTeam(false)
  }

  return (
    <nav className="side" aria-label="Ana menü">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#7c3aed',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Logo />
        </div>
        <span style={{ fontWeight: 600, fontSize: 15 }}>AjanGrid</span>
        <button
          className="ib"
          style={{
            marginLeft: 'auto',
            border: '1px solid var(--w12)',
            background: 'var(--w04)',
            width: 30,
            height: 30
          }}
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
          title={theme === 'dark' ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
        >
          {theme === 'dark' ? <Sun /> : <Moon />}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`nav ${view === n.id ? 'active' : ''}`}
            onClick={() => setView(n.id)}
          >
            {n.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px'
          }}
        >
          <span className="section-title">Ekipler</span>
          <button className="ib" aria-label="Yeni ekip" onClick={() => setAddingTeam((v) => !v)}>
            <Plus />
          </button>
        </div>
        {data?.teams.map((t) => {
          const active = t.id === team?.id
          const busy = runs.some((r) => r.teamId === t.id && r.status === 'running')
          return (
            <button
              key={t.id}
              className="nav"
              onClick={() => window.api.settings.set({ activeTeamId: t.id })}
              style={
                active
                  ? {
                      background: 'rgba(124,58,237,.14)',
                      border: '1px solid rgba(139,92,246,.35)',
                      color: 'var(--text-hi)',
                      justifyContent: 'space-between'
                    }
                  : { justifyContent: 'space-between', border: '1px solid transparent' }
              }
            >
              <span style={{ fontWeight: active ? 500 : 400 }}>{t.name}</span>
              {busy ? <span className="badge b-cli">çalışıyor</span> : null}
            </button>
          )
        })}
        {addingTeam ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 6px' }}>
            <label className="lbl" htmlFor="new-team">
              Ekip adı
            </label>
            <input
              id="new-team"
              className="inp"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="ör. Blog → Video"
              autoFocus
            />
            <button className="btn btn-sm btn-p" onClick={addTeam} disabled={!teamName.trim()}>
              Klasör seç ve oluştur
            </button>
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px 4px'
          }}
        >
          <span className="section-title">Ajanlar</span>
          <button className="ib" aria-label="Yeni ajan" onClick={onNewAgent}>
            <Plus />
          </button>
        </div>
        {agents.map((a) => {
          const st = agentState(a.id, runs)
          const sel = a.id === selectedAgentId
          return (
            <button
              key={a.id}
              className="nav"
              onClick={() => onSelectAgent(a.id)}
              style={{ alignItems: 'flex-start', background: sel ? 'var(--w06)' : undefined }}
            >
              <span className="avatar" style={{ background: a.color }}>
                {initialOf(a.name)}
              </span>
              <span
                style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 6
                  }}
                >
                  <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                    {a.name}
                    {a.isManager ? (
                      <span className="muted" style={{ fontWeight: 400 }}>
                        {' '}
                        · yönetici
                      </span>
                    ) : null}
                  </span>
                  <span className="dot" style={{ background: st.dot }} title={st.label} />
                </span>
                <span
                  className="muted"
                  style={{
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {engineLine(a, data)}
                </span>
              </span>
            </button>
          )
        })}
        {!agents.length ? (
          <div className="hint" style={{ padding: '4px 8px' }}>
            Bu ekipte ajan yok.
          </div>
        ) : null}
      </div>
    </nav>
  )
}
