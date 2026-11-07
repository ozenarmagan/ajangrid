import { useState } from 'react'
import type { Orchestration, Theme } from '../../../shared/types'
import { useAgents, useStore } from '../store'
import { agentState, cleanError, engineLine, initialOf } from '../util'
import { Download, Logo, Moon, Plus, Sun, Trash, Upload } from './Icons'

export type View = 'command' | 'agents' | 'engines' | 'help'

const NAV: Array<{ id: View; label: string }> = [
  { id: 'command', label: 'Komuta Merkezi' },
  { id: 'agents', label: 'Ajanlar' },
  { id: 'engines', label: 'Motorlar ve Limitler' },
  { id: 'help', label: 'Kullanım Kılavuzu' }
]

const DOT: Record<Orchestration['status'], string> = {
  running: '#34d399',
  waiting: '#fbbf24',
  done: '#a78bfa',
  error: '#f87171',
  stopped: '#71717a'
}
const STATUS: Record<Orchestration['status'], string> = {
  running: 'çalışıyor',
  waiting: 'yanıt bekliyor',
  done: 'tamamlandı',
  error: 'hata',
  stopped: 'durduruldu'
}

function dayOf(ts: number): string {
  const d = new Date(ts)
  const today = new Date()
  if (d.toDateString() === today.toDateString())
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

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
  const { data, runs, setError, orchs, orchId, setOrchId, dropOrch } = useStore()
  const agents = useAgents()
  const [packMenu, setPackMenu] = useState(false)
  const theme: Theme = data?.settings.theme ?? 'dark'
  const goals = orchs.slice().sort((a, b) => b.startedAt - a.startedAt)

  const openGoal = (id: string | null): void => {
    setOrchId(id)
    setView('command')
  }

  const removeGoal = async (o: Orchestration): Promise<void> => {
    const ok = window.confirm(
      `"${o.title}" hedefi listeden silinsin mi?\n\nSürüyorsa durdurulur. Klasördeki dosyalar silinmez:\n${o.workdir}`
    )
    if (!ok) return
    try {
      await window.api.orch.remove(o.id)
      dropOrch(o.id)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setPackMenu(false)
    try {
      await fn()
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const importPack = (): Promise<void> =>
    run(async () => {
      const r = await window.api.agents.importPack()
      if (r)
        window.alert(
          `${r.added.length} ajan eklendi${r.added.length ? ': ' + r.added.join(', ') : ''}.` +
            (r.warnings.length ? `\n\n• ${r.warnings.join('\n• ')}` : '')
        )
    })

  const addTemplate = (): Promise<void> =>
    run(async () => {
      const added = await window.api.templates.apply('blog-video')
      if (added.length) window.alert(`Havuza eklendi: ${added.join(', ')}`)
    })

  const toggleTheme = (): void => {
    window.api.settings.set({ theme: theme === 'dark' ? 'light' : 'dark' })
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px 4px'
          }}
        >
          <span className="section-title">Hedefler</span>
          <button
            className="ib"
            aria-label="Yeni hedef"
            title="Yeni hedef"
            onClick={() => openGoal(null)}
          >
            <Plus />
          </button>
        </div>
        <button
          className={`nav ${view === 'command' && !orchId ? 'active' : ''}`}
          onClick={() => openGoal(null)}
        >
          + Yeni hedef
        </button>
        <div
          className="scroll"
          style={{ maxHeight: '34vh', display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          {goals.map((o) => {
            const sel = view === 'command' && o.id === orchId
            return (
              <div
                key={o.id}
                className="team-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  borderRadius: 8,
                  ...(sel
                    ? {
                        background: 'rgba(124,58,237,.14)',
                        border: '1px solid rgba(139,92,246,.35)'
                      }
                    : { border: '1px solid transparent' })
                }}
              >
                <button
                  className="nav"
                  onClick={() => openGoal(o.id)}
                  title={`${o.title} · ${STATUS[o.status]}`}
                  style={{ flex: 1, minWidth: 0, background: 'transparent', gap: 8 }}
                >
                  <span className="dot" style={{ background: DOT[o.status], flexShrink: 0 }} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: sel ? 'var(--text-hi)' : undefined
                    }}
                  >
                    {o.title}
                  </span>
                  <span className="hint" style={{ flexShrink: 0 }}>
                    {dayOf(o.startedAt)}
                  </span>
                </button>
                <span className="team-act" style={{ display: 'flex', paddingRight: 4 }}>
                  <button
                    className="ib"
                    aria-label={`${o.title} hedefini sil`}
                    title="Listeden sil (dosyalar kalır)"
                    onClick={() => removeGoal(o)}
                  >
                    <Trash />
                  </button>
                </span>
              </div>
            )
          })}
          {!goals.length ? (
            <div className="hint" style={{ padding: '4px 8px' }}>
              Henüz hedef yok.
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="scroll"
        style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 6px 4px'
          }}
        >
          <span className="section-title">Ajan havuzu</span>
          <span style={{ display: 'flex' }}>
            <button
              className="ib"
              aria-label="Ajan paketi işlemleri"
              title="İçe / dışa aktar, şablon"
              aria-expanded={packMenu}
              onClick={() => setPackMenu(!packMenu)}
            >
              <Download />
            </button>
            <button className="ib" aria-label="Yeni ajan" title="Yeni ajan" onClick={onNewAgent}>
              <Plus />
            </button>
          </span>
        </div>
        {packMenu ? (
          <div className="card" style={{ padding: 6, gap: 2, margin: '0 4px 6px' }}>
            <button className="nav" onClick={importPack}>
              <Upload /> Dosyadan ajan ekle…
            </button>
            <button className="nav" onClick={() => run(() => window.api.agents.exportAll())}>
              <Download /> Ajanları dışa aktar…
            </button>
            <button className="nav" onClick={addTemplate}>
              <Plus /> Blog → Video ajanlarını ekle
            </button>
          </div>
        ) : null}
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
            Havuzda ajan yok.
          </div>
        ) : null}
      </div>
    </nav>
  )
}
