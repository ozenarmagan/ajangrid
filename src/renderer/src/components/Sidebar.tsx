import { useState } from 'react'
import type { Theme } from '../../../shared/types'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { agentState, cleanError, engineLine, initialOf } from '../util'
import { Download, Logo, Moon, Pencil, Plus, Sun, Trash } from './Icons'

export type View = 'command' | 'agents' | 'engines'

const NAV: Array<{ id: View; label: string }> = [
  { id: 'command', label: 'Komuta Merkezi' },
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
  const { data, runs, setError } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const [addingTeam, setAddingTeam] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [templateId, setTemplateId] = useState('blog-video')
  const theme: Theme = data?.settings.theme ?? 'dark'

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const startRename = (id: string, name: string): void => {
    setEditingId(id)
    setEditName(name)
  }

  const saveRename = async (id: string): Promise<void> => {
    const t = data?.teams.find((x) => x.id === id)
    if (!t || !editName.trim()) return
    await window.api.teams.save({ ...t, name: editName.trim() })
    setEditingId(null)
  }

  const removeTeam = async (id: string, name: string): Promise<void> => {
    const n = data?.agents.filter((a) => a.teamId === id).length ?? 0
    const ok = window.confirm(
      `"${name}" ekibi ve ${n} ajanı silinsin mi?\n\nSüren işler durdurulur. Çalışma klasöründeki dosyalar silinmez.`
    )
    if (!ok) return
    try {
      await window.api.teams.remove(id)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const exportTeam = async (id: string): Promise<void> => {
    try {
      await window.api.teams.exportTeam(id)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const importTeam = async (): Promise<void> => {
    try {
      const r = await window.api.teams.importTeam()
      if (r) {
        setAddingTeam(false)
        if (r.warnings.length) window.alert(`Ekip içe aktarıldı.\n\n• ${r.warnings.join('\n• ')}`)
      }
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const toggleTheme = (): void => {
    window.api.settings.set({ theme: theme === 'dark' ? 'light' : 'dark' })
  }

  const addTeam = async (): Promise<void> => {
    const name = teamName.trim()
    if (!name) return
    const dir = await window.api.dialog.pickFolder()
    if (!dir) return
    await window.api.templates.apply(templateId, name, dir)
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
          if (editingId === t.id) {
            return (
              <div key={t.id} style={{ display: 'flex', gap: 4, padding: '2px 4px' }}>
                <label htmlFor={`rn-${t.id}`} className="sr">
                  Ekip adı
                </label>
                <input
                  id={`rn-${t.id}`}
                  className="inp"
                  style={{ minHeight: 32, padding: '4px 8px' }}
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveRename(t.id)
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
                <button
                  className="btn btn-sm btn-p"
                  onClick={() => saveRename(t.id)}
                  disabled={!editName.trim()}
                >
                  Kaydet
                </button>
              </div>
            )
          }
          return (
            <div
              key={t.id}
              className="team-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                borderRadius: 8,
                ...(active
                  ? { background: 'rgba(124,58,237,.14)', border: '1px solid rgba(139,92,246,.35)' }
                  : { border: '1px solid transparent' })
              }}
            >
              <button
                className="nav"
                onClick={() => window.api.settings.set({ activeTeamId: t.id })}
                style={{
                  flex: 1,
                  minWidth: 0,
                  background: 'transparent',
                  color: active ? 'var(--text-hi)' : undefined
                }}
              >
                <span
                  style={{
                    fontWeight: active ? 500 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t.name}
                </span>
                {busy ? <span className="badge b-cli">çalışıyor</span> : null}
              </button>
              <span className="team-act" style={{ display: 'flex', paddingRight: 4 }}>
                <button
                  className="ib"
                  aria-label={`${t.name} ekibini yeniden adlandır`}
                  title="Yeniden adlandır"
                  onClick={() => startRename(t.id, t.name)}
                >
                  <Pencil />
                </button>
                <button
                  className="ib"
                  aria-label={`${t.name} ekibini dışa aktar`}
                  title="Dışa aktar (şablon dosyası)"
                  onClick={() => exportTeam(t.id)}
                >
                  <Download />
                </button>
                <button
                  className="ib"
                  aria-label={`${t.name} ekibini sil`}
                  title={(data?.teams.length ?? 0) <= 1 ? 'Son ekip silinemez' : 'Ekibi sil'}
                  disabled={(data?.teams.length ?? 0) <= 1}
                  onClick={() => removeTeam(t.id, t.name)}
                >
                  <Trash />
                </button>
              </span>
            </div>
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
            <label className="lbl" htmlFor="new-team-tpl">
              Şablon
            </label>
            <select
              id="new-team-tpl"
              className="inp"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="blog-video">Blog → Video (6 ajan)</option>
              <option value="empty">Boş ekip (yalnızca yönetici)</option>
            </select>
            <button className="btn btn-sm btn-p" onClick={addTeam} disabled={!teamName.trim()}>
              Klasör seç ve oluştur
            </button>
            <button className="btn btn-sm" onClick={importTeam}>
              Dosyadan içe aktar…
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
