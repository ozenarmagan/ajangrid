import { useEffect, useRef, useState } from 'react'
import {
  EFFORT_LABELS,
  type Agent,
  type AgentProposal,
  type OrchStep,
  type Orchestration
} from '../../../shared/types'
import { Folder, X } from '../components/Icons'
import { Composer } from '../components/Composer'
import { useAgents, useCurrentOrch, useStore } from '../store'
import { KanbanBoard } from './KanbanBoard'
import { Schedules } from '../components/Schedules'
import { cleanError, engineLine, initialOf, timeOf } from '../util'

const dateOf = (ts: number): string =>
  new Date(ts).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })

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

function Step({
  s,
  agents,
  onRestore
}: {
  s: OrchStep
  agents: Agent[]
  /** Döngü çalışmıyorsa klasörü bu adımdan önceki hale döndürme */
  onRestore?: () => void
}): React.JSX.Element | null {
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
      {s.snap && onRestore ? (
        <button
          className="linkbtn"
          onClick={onRestore}
          title="Klasördeki dosyaları bu görev başlamadan önceki haline döndürür"
        >
          ↶ Bu adımdan önceki hale dön
        </button>
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
        : `${p.cli === 'codex' ? 'Codex CLI' : p.cli === 'gemini' ? 'Gemini CLI' : p.cli === 'antigravity' ? 'Antigravity CLI' : 'Claude Code'}${p.model ? ' · ' + p.model : ''}`
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
          <div className="hint">
            İzinler: {perms(p)}
            {p.mcpServers?.length ? ` · MCP: ${p.mcpServers.join(', ')}` : ''}
          </div>
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
  const q = o.question
  if (!q) return null
  const title =
    q.kind === 'approval'
      ? 'Onay noktası'
      : q.kind === 'team'
        ? 'Yeni ajan önerisi'
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {approvalLike ? (
          <button
            className="btn btn-p"
            onClick={() => window.api.orch.answer(o.id, { approve: true })}
          >
            {q.kind === 'team' ? 'Ajanları oluştur, devam et' : 'Onayla, devam et'}
          </button>
        ) : (
          <button
            className="btn"
            onClick={() => window.api.orch.answer(o.id, { approve: true, text: 'Devam et.' })}
          >
            Devam et
          </button>
        )}
        <button className="btn btn-danger" onClick={() => window.api.orch.stop(o.id)}>
          Durdur
        </button>
        <span className="hint">
          {approvalLike
            ? 'Düzeltme istersen aşağıdaki kutuya yaz.'
            : 'Yanıtını aşağıdaki kutuya yaz.'}
        </span>
      </div>
    </div>
  )
}

export type ManagerMode = 'flow' | 'kanban'

function GoalView({
  o,
  agents,
  onRestore,
  onResume
}: {
  o: Orchestration
  agents: Agent[]
  onRestore: (stepId: string, name: string) => void
  onResume: () => void
}): React.JSX.Element {
  const st = STATUS_TEXT[o.status]
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
      <div className="bubble-user" style={{ alignSelf: 'flex-end', maxWidth: '78%' }}>
        {o.goal}
      </div>
      <div className="hint">
        {dateOf(o.startedAt)} · <span style={{ color: st.c }}>{st.t}</span>
        {o.checkpoints.length
          ? ` · onay noktaları: ${o.checkpoints
              .map((id) => agents.find((a) => a.id === id)?.name)
              .filter(Boolean)
              .join(', ')}`
          : ''}
      </div>
      {o.steps.map((s) => (
        <Step
          key={s.id}
          s={s}
          agents={agents}
          onRestore={
            o.status !== 'running' && s.kind === 'task' && s.snap
              ? () => onRestore(s.id, agents.find((a) => a.id === s.agentId)?.name ?? 'ajan')
              : undefined
          }
        />
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
          <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--violet-fg)' }}>Sonuç</div>
          <div className="pre">{o.summary}</div>
        </div>
      ) : null}
      {o.status === 'error' || (o.status === 'stopped' && o.error) ? (
        <div className="hint" style={{ color: 'var(--red-fg)' }}>
          {o.error}
        </div>
      ) : null}
      {o.status === 'error' || o.status === 'stopped' ? (
        <div>
          <button className="btn btn-sm" onClick={onResume}>
            ↻ Kaldığı yerden devam et
          </button>
        </div>
      ) : null}
    </section>
  )
}

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
  const { data, orchs, outputTick, setError, setOrchId } = useStore()
  const agents = useAgents()
  const o = useCurrentOrch()
  const [draft, setDraft] = useState('')
  const [showSchedules, setShowSchedules] = useState(false)
  const [showCps, setShowCps] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const members = agents.filter((a) => !a.isManager)
  const checkpoints = data?.settings.checkpoints ?? []
  const activeCount = orchs.filter((x) => x.status === 'running' || x.status === 'waiting').length

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
  }, [o, outputTick, mode])

  const resume = async (id: string): Promise<void> => {
    try {
      await window.api.orch.resume(id)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const restoreStep = async (stepId: string, name: string): Promise<void> => {
    if (!o) return
    const ok = window.confirm(
      `Çalışma klasörü, "${name}" görevi başlamadan önceki haline döndürülecek.\n\nBu adımdan sonra oluşan ya da değişen dosyalar geri alınır. Şu anki hal de ayrıca kaydedilir.`
    )
    if (!ok) return
    try {
      await window.api.orch.restoreStep(o.id, stepId)
    } catch (e) {
      setError(cleanError(e))
    }
  }

  const toggleCheckpoint = (id: string): void => {
    const next = checkpoints.includes(id)
      ? checkpoints.filter((x) => x !== id)
      : [...checkpoints, id]
    window.api.settings.set({ checkpoints: next })
  }

  const pickFolder = async (): Promise<void> => {
    const dir = await window.api.dialog.pickFolder()
    if (dir) setFolder(dir)
  }

  const send = async (text: string, files: string[]): Promise<boolean> => {
    try {
      if (!o) {
        const created = await window.api.orch.start(text, {
          files,
          workdir: folder ?? undefined
        })
        setFolder(null)
        setShowSchedules(false)
        setOrchId(created.id)
      } else {
        await window.api.orch.message(o.id, text, files)
      }
      return true
    } catch (e) {
      setError(cleanError(e))
      return false
    }
  }

  const q = o?.question
  const placeholder = !o
    ? 'Yöneticiye ne yapmak istediğini yaz… Dosya ya da görsel ekleyebilirsin.'
    : o.status === 'running'
      ? 'Yönetici çalışıyor… Bitince ya da bir soru sorunca yazabilirsin.'
      : o.status === 'waiting'
        ? q?.kind === 'approval' || q?.kind === 'team'
          ? 'Onaylamak yerine düzeltme istemek için yaz…'
          : 'Yöneticiye yanıtını yaz…'
        : 'Bu hedefle ilgili yeni talimat yaz; yönetici aynı klasörde devam eder…'
  const sendLabel = !o
    ? 'Başlat'
    : o.status === 'waiting'
      ? q?.kind === 'approval' || q?.kind === 'team'
        ? 'Düzeltme iste'
        : 'Yanıtla'
      : 'Devam ettir'

  const cpChips = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="hint">Görev vermeden önce onayımı iste:</span>
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
      {!members.length ? <span className="hint">havuzda alt ajan yok</span> : null}
    </div>
  )

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className="avatar" style={{ background: manager.color, width: 34, height: 34 }}>
            {initialOf(manager.name)}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span
              style={{
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {o ? o.title : 'Yeni hedef'}
              {o ? (
                <span style={{ fontSize: 12, fontWeight: 400, color: STATUS_TEXT[o.status].c }}>
                  {' '}
                  · {STATUS_TEXT[o.status].t}
                </span>
              ) : null}
            </span>
            <span className="hint">
              {manager.name} · havuzda {members.length} alt ajan
              {activeCount ? ` · ${activeCount} hedef sürüyor` : ''}
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
            Yöneticiyi düzenle
          </button>
        </div>
      </header>

      {mode === 'kanban' ? (
        <KanbanBoard
          key={o?.id ?? 'all'}
          onFocusAgent={onFocusAgent}
          onOpenFlow={() => onMode('flow')}
        />
      ) : (
        <div
          ref={scroller}
          className="scroll"
          style={{ flex: 1, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {o ? (
            <GoalView o={o} agents={agents} onRestore={restoreStep} onResume={() => resume(o.id)} />
          ) : (
            <div
              className="muted"
              style={{ margin: 'auto', textAlign: 'center', maxWidth: 480, lineHeight: 1.6 }}
            >
              {members.length
                ? `Ne yapmak istediğini yaz. Yönetici havuzdaki ${members.length} ajan arasından bu işe uygun olanları seçer, görevleri dağıtır ve çıktıları denetler. Her hedef kendi klasöründe çalışır; birden fazla hedef aynı anda sürebilir.`
                : 'Ne yapmak istediğini yaz. Havuzda uygun ajan yoksa yönetici önce yeni ajanlar önerir; onaylarsan oluşturulur ve iş başlar.'}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: '12px 22px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!o && showSchedules ? (
          <Schedules goal={draft} onCreated={() => setShowSchedules(false)} />
        ) : null}
        {showCps ? cpChips : null}
        <Composer
          key={o?.id ?? 'yeni'}
          autoFocus
          placeholder={placeholder}
          sendLabel={sendLabel}
          busy={o?.status === 'running'}
          onStop={() => o && window.api.orch.stop(o.id)}
          onSend={send}
          onError={setError}
          onTextChange={setDraft}
          footer={
            <>
              {!o ? (
                folder ? (
                  <span
                    className="chip on"
                    title={folder}
                    style={{ display: 'inline-flex', gap: 4 }}
                  >
                    <Folder /> {folder.split(/[\\/]/).pop()}
                    <button
                      className="ib"
                      style={{ width: 18, height: 18 }}
                      aria-label="Var olan klasör seçimini kaldır"
                      onClick={() => setFolder(null)}
                    >
                      <X />
                    </button>
                  </span>
                ) : (
                  <button
                    className="chip"
                    onClick={pickFolder}
                    title="Boş bırakırsan bu hedef için yeni bir klasör açılır"
                  >
                    <Folder /> Klasör: yeni
                  </button>
                )
              ) : null}
              <button
                className={`chip ${showCps || checkpoints.length ? 'on' : ''}`}
                aria-expanded={showCps}
                onClick={() => setShowCps(!showCps)}
                title="Hangi ajanlara görev verilmeden önce onayın istensin"
              >
                Onay noktaları{checkpoints.length ? ` (${checkpoints.length})` : ''}
              </button>
              {!o ? (
                <button
                  className={`chip ${showSchedules ? 'on' : ''}`}
                  aria-pressed={showSchedules}
                  onClick={() => setShowSchedules(!showSchedules)}
                  title="Bu hedefi belirli gün ve saatlerde otomatik başlat"
                >
                  Zamanla
                </button>
              ) : null}
            </>
          }
        />
      </div>
    </main>
  )
}
