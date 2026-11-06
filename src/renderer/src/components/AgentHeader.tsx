import { EFFORT_LABELS, type Agent } from '../../../shared/types'
import { useStore } from '../store'
import { agentState, engineBadge, engineLine, initialOf } from '../util'

export function AgentHeader({
  agent,
  onEdit,
  extra
}: {
  agent: Agent
  onEdit: () => void
  extra?: React.ReactNode
}): React.JSX.Element {
  const { data, runs } = useStore()
  const badge = engineBadge(agent)
  const st = agentState(agent.id, runs)
  return (
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
        <button className="btn btn-sm" onClick={onEdit}>
          Düzenle
        </button>
        {extra}
      </div>
    </header>
  )
}
