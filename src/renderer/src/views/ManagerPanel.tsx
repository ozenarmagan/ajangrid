import { useEffect, useMemo, useRef, useState } from 'react'
import {
  EFFORT_LABELS,
  type Agent,
  type AgentProposal,
  type OrchStep,
  type Orchestration
} from '../../../shared/types'
import { Stop } from '../components/Icons'
import { useActiveTeam, useStore, useTeamAgents } from '../store'
import { KanbanBoard } from './KanbanBoard'
import { cleanError, engineLine, initialOf, timeOf } from '../util'

const STATUS_TEXT: Record<string, { t: string; c: string; dot: string }> = {
  running: { t: 'Çalışıyor', c: 'var(--green-fg)', dot: '#34d399' },
  done: { t: 'Tamamlandı', c: 'var(--violet-fg)', dot: '#a78bfa' },
  error: { t: 'Hata', c: 'var(--red-fg)', dot: '#f87171' },
  stopped: { t: 'Durduruldu', c: 'var(--amber-fg)', dot: '#fbbf24' },
  waiting: { t: 'Senden yanıt bekliyor', c: 'var(--amber-fg)', dot: '#fbbf24' }
}

function Collapsible({ text, limit = 420 }: { text: string; limit?: number }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  if (text.length <= limit) return <div className="pre">{text}</div>
  return (
    <>
      <div className="pre">{open ? text : text.slice(0, limit) + '…'}</div>
      <button className="linkbtn" onClick={() => setOpen(!open)}>
        {open ? 'Daralt' : 'Tamamını göster'}
      </button>
    </>
  )
}

function Step({ s, agents }: { s: OrchStep; agents: Agent[] }): React.JSX.Element | null {
  const ag = agents.find((a) => a.id === s.agentId)
  if (s.kind === 'user') {
    return (
      <div className="bubble-user" style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
        {s.text}
      </div>
    )
  }
  if (s.kind === 'note') {
    return <div className="hint">• {s.text}</div>
  }
  if (s.kind === 'manager') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '88%' }}>
        <div className="hint">Yönetici · {timeOf(s.at)}</div>
        <div className="bubble-agent">
          {s.status === 'running' ? (
            <span className="muted">Planlıyor…</span>
          ) : (
            <Collapsible text={s.text || '(değerlendirme yok)'} />
          )}
        </div>
      </div>
    )
  }
  const st = STATUS_TEXT[s.status ?? 'running'] ?? STATUS_TEXT.running
  return (
    <div className="step-task" style={{ maxWidth: '88%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="dot" style={{ background: st.dot }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>→ {ag?.name ?? 'Ajan'}</span>
        <span style={{ fontSize: 12, color: st.c, marginLeft: 'auto' }}>{st.t}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)' }}>
        <Collapsible text={s.task ?? ''} limit={300} />
      </div>
      {s.text && s.status !== 'running' ? (
        <div
          className="term mono"
          style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--text3)' }}
        >
          <Collapsible text={s.text} limit={500} />
        </div>
      ) : null}
    </div>
  )
}

function ProposalList({ proposals }: { proposals: AgentProposal[] }): React.JSX.Element {
  const engineText = (p: AgentProposal): string =>
    p.engine === 'api'
      ? `API · ${p.apiProvider} · ${p.model || 'model yok'}`
      : p.engine === 'local'
        ? 'Yerel araç'
        : `${p.cli === 'codex' ? 'Codex CLI' : p.cli === 'gemini' ? 'Gemini CLI' : 'Claude Code'}${p.model ? ' · ' + p.model : ''}`
  const perms = (p: AgentProposal): string =>
    [
      p.permissions.write && 'dosya yazar',
      p.permissions.shell && 'komut çalıştırır',
      p.permissions.network && 'internet'
    ]
      .filter(Boolean)
      .join(', ') || 'yalnızca okur'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {proposals.map((p) => (
        <div key={p.name} className="card" style={{ padding: '10px 12px', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{p.name}</span>
            <span
              className={`badge ${p.engine === 'api' ? 'b-api' : p.engine === 'local' ? 'b-loc' : 'b-cli'}`}
            >
              {engineText(p)}
            </span>
            {p.engine !== 'local' ? (
              <span className="badge b-neutral">
                Efor: {EFFORT_LABELS[p.effort].toLocaleLowerCase('tr')}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 13 }}>{p.title}</div>
          <div className="hint">İzinler: {perms(p)}</div>
          {p.warnings?.length ? (
            <div className="hint" style={{ color: 'var(--red-fg)' }}>
              ⚠ {p.warnings.join(' · ')}
            </div>
          ) : null}
          <details>
            <summary className="hint" style={{ cursor: 'pointer' }}>
              Rol metni
            </summary>
            <div className="pre" style={{ fontSize: 12.5, marginTop: 4 }}>
              {p.role}
            </div>
          </details>
        </div>
      ))}
      <div className="hint">Oluştuktan sonra Ajanlar ekranından her ayarı değiştirebilirsin.</div>
    </div>
  )
}

function QuestionCard({ o }: { o: Orchestration }): React.JSX.Element | null {
  const [text, setText] = useState('')
  const q = o.question
  if (!q) return null
  const answer = (approve: boolean): void => {
    window.api.orch.answer(o.id, { approve, text: text.trim() || undefined })
    setText('')
  }
  const title =
    q.kind === 'approval'
      ? 'Onay noktası'
      : q.kind === 'team'
        ? 'Ekip önerisi'
        : q.kind === 'limit'
          ? 'Limit doldu'
          : 'Yöneticinin sorusu'
  const approvalLike = q.kind === 'approval' || q.kind === 'team'
  return (
    <div
      style={{
        background: 'rgba(251,191,36,.07)',
        border: '1px solid rgba(251,191,36,.4)',
        borderRadius: 14,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: '88%'
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--amber-fg)' }}>{title}</div>
      <div className="pre">{q.text}</div>
      {q.kind === 'team' && q.proposals ? <ProposalList proposals={q.proposals} /> : null}
      <label htmlFor={`q-${q.id}`} className="sr">
        Yanıt
      </label>
      <textarea
        id={`q-${q.id}`}
        className="inp"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={approvalLike ? 'İstersen not ya da düzeltme yaz…' : 'Yanıtını yaz…'}
      />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {approvalLike ? (
          <>
            <button className="btn btn-p" onClick={() => answer(true)}>
              {q.kind === 'team' ? 'Ekibi oluştur, devam et' : 'Onayla, devam et'}
            </button>
            <button className="btn" onClick={() => answer(false)} disabled={!text.trim()}>
              Düzeltme iste
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-p" onClick={() => answer(true)} disabled={!text.trim()}>
              Yanıtla
            </button>
            <button
              className="btn"
              onClick={() => (
                setText(''),
                window.api.orch.answer(o.id, { approve: true, text: 'Devam et.' })
              )}
            >
              Devam et
            </button>
          </>
        )}
        <button className="btn btn-danger" onClick={() => window.api.orch.stop(o.id)}>
          Durdur
        </button>
      </div>
    </div>
  )
}

export type ManagerMode = 'flow' | 'kanban'

export function ManagerPanel({
  manager,
  onEdit,
  mode,
  onMode,
  onFocusAgent
}: {
  mode: ManagerMode
  onMode: (m: ManagerMode) => void
  onFocusAgent: (id: string) => void
  manager: Agent
  onEdit: () => void
}): React.JSX.Element {
  const { data, orchs, outputTick, setError } = useStore()
  const agents = useTeamAgents()
  const team = useActiveTeam()
  const [goal, setGoal] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const members = agents.filter((a) => !a.isManager)
  const mine = useMemo(
    () => orchs.filter((o) => o.teamId === manager.teamId),
    [orchs, manager.teamId]
  )
  const active = mine.find((o) => o.status === 'running' || o.status === 'waiting')
  const checkpoints = team?.checkpoints ?? []

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [mine, outputTick, mode])

  const toggleCheckpoint = (id: string): void => {
    if (!team) return
    const next = checkpoints.includes(id)
      ? checkpoints.filter((x) => x !== id)
      : [...checkpoints, id]
    window.api.teams.save({ ...team, checkpoints: next })
  }

  const start = async (): Promise<void> => {
    if (!team || !goal.trim()) return
    try {
      await window.api.orch.start(team.id, goal.trim(), checkpoints)
      setGoal('')
    } catch (e) {
      setError(cleanError(e))
    }
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
          <span className="avatar" style={{ background: manager.color, width: 34, height: 34 }}>
            {initialOf(manager.name)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600 }}>
              {manager.name}
              {active ? (
                <span
                  style={{ fontSize: 12, fontWeight: 400, color: STATUS_TEXT[active.status].c }}
                >
                  {' '}
                  · {STATUS_TEXT[active.status].t}
                </span>
              ) : null}
            </span>
            <span className="hint">
              {team?.name} · {members.length} alt ajan
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="seg-group" role="group" aria-label="Görünüm" style={{ padding: 3 }}>
            <button
              className={`seg ${mode === 'flow' ? 'on' : ''}`}
              style={{ minHeight: 28, padding: '0 12px' }}
              aria-pressed={mode === 'flow'}
              onClick={() => onMode('flow')}
            >
              Akış
            </button>
            <button
              className={`seg ${mode === 'kanban' ? 'on' : ''}`}
              style={{ minHeight: 28, padding: '0 12px' }}
              aria-pressed={mode === 'kanban'}
              onClick={() => onMode('kanban')}
            >
              Kanban
            </button>
          </div>
          <span className="badge b-cli">{engineLine(manager, data)}</span>
          <span className="badge b-amber">
            Efor: {EFFORT_LABELS[manager.effort].toLocaleLowerCase('tr')}
          </span>
          <button className="btn btn-sm" onClick={onEdit}>
            Düzenle
          </button>
          {active ? (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => window.api.orch.stop(active.id)}
            >
              <Stop size={12} /> Durdur
            </button>
          ) : null}
        </div>
      </header>

      {mode === 'kanban' && team ? (
        <KanbanBoard
          teamId={team.id}
          onFocusAgent={onFocusAgent}
          onOpenFlow={() => onMode('flow')}
        />
      ) : (
        <div
          ref={scroller}
          className="scroll"
          style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {!mine.length ? (
            <div
              className="muted"
              style={{ margin: 'auto', textAlign: 'center', maxWidth: 460, lineHeight: 1.6 }}
            >
              {members.length
                ? `Yöneticiye bir hedef ver. Hedefi adımlara böler, ${members.length} alt ajana dağıtır, çıktıları denetler ve işaretlediğin ajanlardan önce onayını ister.`
                : 'Yöneticiye hedefini yaz. Ekipte uygun ajan yoksa önce bir ekip önerir; onaylarsan ajanlar oluşturulur ve iş başlar.'}
            </div>
          ) : null}
          {mine.map((o) => {
            const st = STATUS_TEXT[o.status]
            return (
              <section
                key={o.id}
                style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}
              >
                <div className="bubble-user" style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
                  {o.goal}
                </div>
                <div className="hint">
                  {timeOf(o.startedAt)} · <span style={{ color: st.c }}>{st.t}</span>
                  {o.checkpoints.length
                    ? ` · onay noktaları: ${o.checkpoints
                        .map((id) => agents.find((a) => a.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}`
                    : ''}
                </div>
                {o.steps.map((s) => (
                  <Step key={s.id} s={s} agents={agents} />
                ))}
                {o.status === 'waiting' ? <QuestionCard key={o.question?.id} o={o} /> : null}
                {o.status === 'done' && o.summary ? (
                  <div
                    style={{
                      border: '1px solid rgba(139,92,246,.4)',
                      background: 'rgba(124,58,237,.08)',
                      borderRadius: 14,
                      padding: '12px 14px',
                      maxWidth: '88%'
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--violet-fg)' }}>
                      Sonuç
                    </div>
                    <div className="pre">{o.summary}</div>
                  </div>
                ) : null}
                {o.status === 'error' || (o.status === 'stopped' && o.error) ? (
                  <div className="hint" style={{ color: 'var(--red-fg)' }}>
                    {o.error}
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}

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
          <label htmlFor="goal" className="sr">
            Hedef
          </label>
          <textarea
            id="goal"
            rows={2}
            className="composer"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                start()
              }
            }}
            disabled={Boolean(active)}
            placeholder={
              active
                ? 'Süren bir döngü var. Bitmesini bekle ya da durdur.'
                : 'Yöneticiye hedef ver… ör. "blog.md yazısını 60 saniyelik dikey videoya çevir" (Ctrl/⌘+Enter)'
            }
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span className="hint">Onay iste:</span>
              {members.map((a) => (
                <button
                  key={a.id}
                  className={`chip ${checkpoints.includes(a.id) ? 'on' : ''}`}
                  aria-pressed={checkpoints.includes(a.id)}
                  onClick={() => toggleCheckpoint(a.id)}
                >
                  {a.name}
                </button>
              ))}
              {!members.length ? <span className="hint">alt ajan yok</span> : null}
            </div>
            <button
              className="btn btn-p"
              onClick={start}
              disabled={!goal.trim() || Boolean(active)}
            >
              Başlat
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
