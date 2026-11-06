import type { Theme } from '../../../shared/types'
import { TeamPanel } from '../components/TeamPanel'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { cleanError } from '../util'
import { ManagerPanel } from './ManagerPanel'

interface Props {
  focusId: string | null
  setFocusId: (id: string | null) => void
  theme: Theme
  onEditAgent: (id: string) => void
}

/** Ana ekran: solda yönetici ile konuşma, sağda ekibin ne yaptığı. */
export function CommandCenter({
  focusId,
  setFocusId,
  theme,
  onEditAgent
}: Props): React.JSX.Element {
  const { setError } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const manager = agents.find((a) => a.isManager)

  const createManager = async (): Promise<void> => {
    if (!team) return
    try {
      await window.api.agents.save({
        id: '',
        teamId: team.id,
        name: 'Yönetici',
        title: 'Hedefi adımlara böler, ajanlara dağıtır, çıktıları denetler',
        role: 'Sen bu ekibin yöneticisisin. Kalite çıtan yüksek olsun; gereksiz adım ekleme.',
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
        <ManagerPanel manager={manager} onEdit={() => onEditAgent(manager.id)} />
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
            Bu ekipte yönetici yok. Tüm işi yönetici üzerinden yürütmek için bir yönetici oluştur;
            gereken alt ajanları o önerecek.
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
