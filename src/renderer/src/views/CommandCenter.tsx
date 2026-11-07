import { useState } from 'react'
import type { Theme } from '../../../shared/types'
import { TeamPanel } from '../components/TeamPanel'
import { useAgents, useStore } from '../store'
import { cleanError } from '../util'
import { ManagerPanel, type ManagerMode } from './ManagerPanel'

interface Props {
  focusId: string | null
  setFocusId: (id: string | null) => void
  theme: Theme
  onEditAgent: (id: string) => void
}

/** Ana ekran: solda yönetici ile konuşma, sağda ajanların ne yaptığı. */
export function CommandCenter({
  focusId,
  setFocusId,
  theme,
  onEditAgent
}: Props): React.JSX.Element {
  const { setError } = useStore()
  const agents = useAgents()
  const manager = agents.find((a) => a.isManager)
  const [mode, setMode] = useState<ManagerMode>('flow')

  const createManager = async (): Promise<void> => {
    try {
      await window.api.agents.save({
        id: '',
        name: 'Yönetici',
        title: 'Hedefi adımlara böler, ajanlara dağıtır, çıktıları denetler',
        role: 'Sen yöneticisin. Kalite çıtan yüksek olsun; gereksiz adım ekleme.',
        isManager: true,
        color: '#c4b5fd',
        engine: 'cli',
        cli: 'claude',
        model: 'opus',
        effort: 'high',
        permissions: { write: false, shell: false, network: false },
        createdAt: 0
      })
    } catch (e) {
      setError(cleanError(e))
    }
  }

  return (
    <>
      {manager ? (
        <ManagerPanel
          manager={manager}
          onEdit={() => onEditAgent(manager.id)}
          mode={mode}
          onMode={setMode}
          onFocusAgent={(id) => setFocusId(id)}
        />
      ) : (
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 14,
            borderRight: '1px solid var(--w08)'
          }}
        >
          <div className="muted" style={{ maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
            Yönetici yok. Tüm işi yönetici üzerinden yürütmek için bir yönetici oluştur; gereken alt
            ajanları o önerecek.
          </div>
          <button className="btn btn-p" onClick={createManager}>
            Yönetici oluştur (Claude Code · Opus)
          </button>
        </main>
      )}
      <TeamPanel
        focusId={focusId}
        setFocusId={setFocusId}
        onEditAgent={onEditAgent}
        theme={theme}
      />
    </>
  )
}
