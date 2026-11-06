import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type {
  Agent,
  AppData,
  Assignment,
  OrchAnswer,
  OrchQuestion,
  OrchStep,
  Orchestration,
  RunInfo,
  Team
} from '../shared/types'
import { API_LABELS, CLI_LABELS } from '../shared/types'
import { loadData, newId } from './store'
import type { RunManager } from './runner'

type Send = (channel: string, payload: unknown) => void

const RESULT_CHARS = 2500
const DEFAULT_MAX_STEPS = 30
const MAX_PARSE_FAILS = 3

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g

interface ManagerAction {
  action: 'assign' | 'assign_parallel' | 'ask_user' | 'finish'
  agent?: string
  task?: string
  assignments?: Array<{ agent: string; task: string }>
  question?: string
  summary?: string
}

/** Metindeki son JSON nesnesini (tercihen ```json bloğu) bulur. */
export function extractAction(text: string): ManagerAction | null {
  const clean = text.replace(ANSI, '')
  const fences = [...clean.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1])
  const candidates = fences.reverse()
  // Kod bloğu yoksa metindeki son dengeli {...} parçasını dene
  if (!candidates.length) {
    const end = clean.lastIndexOf('}')
    if (end >= 0) {
      let depth = 0
      for (let i = end; i >= 0; i--) {
        if (clean[i] === '}') depth++
        else if (clean[i] === '{') depth--
        if (depth === 0) {
          candidates.push(clean.slice(i, end + 1))
          break
        }
      }
    }
  }
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim()) as ManagerAction
      if (obj && typeof obj.action === 'string') return obj
    } catch {
      /* sonraki aday */
    }
  }
  return null
}

function tail(s: string, n: number): string {
  const t = s.replace(ANSI, '').trim()
  return t.length > n ? '…' + t.slice(-n) : t
}

function engineText(a: Agent, data: AppData): string {
  if (a.engine === 'api')
    return `${API_LABELS[a.apiProvider ?? 'anthropic']} API · ${a.model} (token başına ücretli)`
  if (a.engine === 'local') {
    const t = data.localTools.find((x) => x.id === a.localToolId)
    return `yerel araç: ${t?.name ?? '?'} (ücretsiz; görev metni komuta {prompt} olarak verilir, kısa ve net yaz)`
  }
  return `${CLI_LABELS[a.cli ?? 'claude']}${a.model ? ' · ' + a.model : ''} (abonelik; dosya ${a.permissions.write ? 'yazabilir' : 'yazamaz'}, komut ${a.permissions.shell ? 'çalıştırabilir' : 'çalıştıramaz'})`
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string, depth: number): void => {
    if (out.length > 60) return
    let names: string[] = []
    try {
      names = readdirSync(join(dir, rel))
    } catch {
      return
    }
    for (const n of names) {
      if (n === '.ajangrid' || n === 'node_modules' || n.startsWith('.')) continue
      const p = rel ? `${rel}/${n}` : n
      let isDir = false
      try {
        isDir = statSync(join(dir, p)).isDirectory()
      } catch {
        isDir = false
      }
      out.push(isDir ? p + '/' : p)
      if (isDir && depth < 1) walk(p, depth + 1)
    }
  }
  walk('', 0)
  return out
}

export class Orchestrator {
  private orchs = new Map<string, Orchestration>()
  private parseFails = new Map<string, number>()
  private loadedTeams = new Set<string>()

  constructor(
    private runs: RunManager,
    private send: Send
  ) {}

  private file(o: Orchestration): string | null {
    const team = loadData().teams.find((t) => t.id === o.teamId)
    if (!team) return null
    const dir = join(team.workdir, '.ajangrid', 'yonetici')
    mkdirSync(dir, { recursive: true })
    return join(dir, `${o.id}.json`)
  }

  private emit(o: Orchestration): void {
    const f = this.file(o)
    if (f) {
      try {
        writeFileSync(f, JSON.stringify(o, null, 2), 'utf8')
      } catch {
        /* kayıt yazılamazsa akışı bozma */
      }
    }
    this.send('orch:update', structuredClone(o))
  }

  /** Bir ekibin eski döngülerini diskten yükler (uygulama yeniden açıldığında). */
  list(teamId: string): Orchestration[] {
    if (!this.loadedTeams.has(teamId)) {
      this.loadedTeams.add(teamId)
      const team = loadData().teams.find((t) => t.id === teamId)
      const dir = team ? join(team.workdir, '.ajangrid', 'yonetici') : null
      if (dir && existsSync(dir)) {
        for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
          try {
            const o = JSON.parse(readFileSync(join(dir, n), 'utf8')) as Orchestration
            if (this.orchs.has(o.id)) continue
            if (o.status === 'running' || o.status === 'waiting') {
              o.status = 'stopped'
              o.error = 'Uygulama kapandığında yarım kaldı.'
            }
            this.orchs.set(o.id, o)
          } catch {
            /* bozuk kayıt */
          }
        }
      }
    }
    return [...this.orchs.values()]
      .filter((o) => o.teamId === teamId)
      .sort((a, b) => a.startedAt - b.startedAt)
  }

  start(teamId: string, goal: string, checkpoints?: string[]): Orchestration {
    const data = loadData()
    const team = data.teams.find((t) => t.id === teamId)
    if (!team) throw new Error('Ekip bulunamadı.')
    const manager = data.agents.find((a) => a.teamId === teamId && a.isManager)
    if (!manager)
      throw new Error('Bu ekipte yönetici yok. Bir ajanı "Bu ekibin yöneticisi" olarak işaretle.')
    if (data.agents.filter((a) => a.teamId === teamId && !a.isManager).length === 0) {
      throw new Error('Yöneticinin görev verebileceği alt ajan yok.')
    }
    const o: Orchestration = {
      id: newId(),
      teamId,
      managerId: manager.id,
      goal,
      status: 'running',
      steps: [],
      checkpoints: checkpoints ?? team.checkpoints ?? [],
      startedAt: Date.now()
    }
    this.orchs.set(o.id, o)
    this.emit(o)
    void this.loop(o)
    return structuredClone(o)
  }

  stop(id: string): void {
    const o = this.orchs.get(id)
    if (!o || (o.status !== 'running' && o.status !== 'waiting')) return
    o.status = 'stopped'
    o.endedAt = Date.now()
    o.question = undefined
    this.runs.stopOrch(id)
    this.emit(o)
  }

  answer(id: string, ans: OrchAnswer): void {
    const o = this.orchs.get(id)
    if (!o || o.status !== 'waiting' || !o.question) return
    const q = o.question
    o.question = undefined
    o.status = 'running'
    if (q.kind === 'approval' && ans.approve && q.pending) {
      this.addStep(o, {
        kind: 'user',
        text: ans.text ? `Onaylandı. Not: ${ans.text}` : 'Onaylandı.'
      })
      this.emit(o)
      void this.execute(o, q.pending, true)
        .then(() => this.loop(o))
        .catch((err) => this.fail(o, String(err)))
      return
    }
    const text = (ans.text ?? '').trim()
    if (q.kind === 'approval') {
      this.addStep(o, { kind: 'user', text: `Onaylanmadı.${text ? ' Düzeltme: ' + text : ''}` })
    } else {
      this.addStep(o, { kind: 'user', text: text || (ans.approve ? 'Devam et.' : 'Yanıt yok.') })
    }
    this.emit(o)
    void this.loop(o)
  }

  private addStep(o: Orchestration, s: Omit<OrchStep, 'id' | 'at'>): OrchStep {
    const step: OrchStep = { id: newId(), at: Date.now(), ...s }
    o.steps.push(step)
    return step
  }

  private alive(o: Orchestration): boolean {
    return o.status === 'running'
  }

  private fail(o: Orchestration, msg: string): void {
    o.status = 'error'
    o.error = msg
    o.endedAt = Date.now()
    this.emit(o)
  }

  private buildPrompt(o: Orchestration, data: AppData, team: Team, correction?: string): string {
    const members = data.agents.filter((a) => a.teamId === o.teamId && !a.isManager)
    const names = (ids: string[]): string =>
      ids
        .map((id) => data.agents.find((a) => a.id === id)?.name)
        .filter(Boolean)
        .join(', ')
    const history = o.steps
      .filter((s) => s.kind !== 'manager' || s.text)
      .map((s, i) => {
        const n = i + 1
        if (s.kind === 'task') {
          const ag = data.agents.find((a) => a.id === s.agentId)?.name ?? '?'
          return `${n}. [Görev → ${ag}] ${s.task}\n   Durum: ${s.status ?? '?'}\n   Çıktı:\n${(s.text ?? '').replace(/^/gm, '   | ')}`
        }
        if (s.kind === 'user') return `${n}. [Kullanıcı] ${s.text}`
        if (s.kind === 'note') return `${n}. [Sistem] ${s.text}`
        return `${n}. [Senin önceki değerlendirmen] ${s.text}`
      })
      .join('\n\n')
    const files = listFiles(team.workdir)

    return [
      `Sen "${team.name}" ekibinin yöneticisisin. Kullanıcının hedefini, ekibindeki ajanlara iş vererek tamamlamalısın.`,
      'İşi kendin yapma: her adımı en uygun ajana ver, çıktısını değerlendir, yetersizse aynı ajana somut düzeltme görevi ver.',
      '',
      '## Hedef',
      o.goal,
      '',
      '## Ekip',
      ...members.map((a) => `- ${a.name}: ${a.title || '(unvan yok)'} — ${engineText(a, data)}`),
      '',
      '## Ortak çalışma klasörü',
      `${team.workdir}`,
      'Ajanlar dosyaları bu klasörde okur ve yazar. Görev verirken okunacak ve yazılacak dosya adlarını açıkça belirt (ör. "ozet.md dosyasını oku, senaryo.md dosyasına yaz").',
      'API ajanları dosya yazamaz; yanıtları otomatik olarak outputs/ klasörüne kaydedilir.',
      'Ajanlar birbirini ve geçmişi görmez: her görev tek başına anlaşılır olmalı.',
      `Klasördeki dosyalar: ${files.length ? files.join(', ') : '(boş)'}`,
      '',
      o.checkpoints.length
        ? `## Onay noktaları\nŞu ajanlara verdiğin görevler, çalışmadan önce sistem tarafından kullanıcı onayına sunulur: ${names(o.checkpoints)}.`
        : '',
      '## Şu ana kadar olanlar',
      history || '(henüz bir şey yapılmadı)',
      '',
      '## Yanıt biçimi',
      'Kısa bir değerlendirme yaz, ardından yanıtını TEK bir ```json kod bloğuyla bitir. Seçenekler:',
      '{"action":"assign","agent":"<ajan adı>","task":"<tek başına anlaşılır görev>"}',
      '{"action":"assign_parallel","assignments":[{"agent":"<ad>","task":"<görev>"}]}   ← yalnızca birbirinden bağımsız işler için',
      '{"action":"ask_user","question":"<kullanıcıya soru>"}   ← yalnızca gerçekten gerekliyse',
      '{"action":"finish","summary":"<kullanıcıya sonuç özeti; üretilen dosyaları belirt>"}',
      correction ? `\nÖNEMLİ: ${correction}` : ''
    ]
      .filter((l) => l !== null)
      .join('\n')
  }

  private resolveAgent(
    data: AppData,
    o: Orchestration,
    name: string | undefined
  ): Agent | undefined {
    if (!name) return undefined
    const norm = (s: string): string => s.toLocaleLowerCase('tr').replace(/\s+/g, '')
    return data.agents.find(
      (a) => a.teamId === o.teamId && !a.isManager && (norm(a.name) === norm(name) || a.id === name)
    )
  }

  private async loop(o: Orchestration, correction?: string): Promise<void> {
    try {
      await this.loopInner(o, correction)
    } catch (err) {
      this.fail(o, `Beklenmeyen hata: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async loopInner(o: Orchestration, correction?: string): Promise<void> {
    const max = loadData().settings.maxOrchestrationSteps ?? DEFAULT_MAX_STEPS
    while (this.alive(o)) {
      const data = loadData()
      const team = data.teams.find((t) => t.id === o.teamId)
      const manager = data.agents.find((a) => a.id === o.managerId)
      if (!team || !manager) return this.fail(o, 'Ekip ya da yönetici silinmiş.')
      const managerTurns = o.steps.filter((s) => s.kind === 'manager').length
      if (managerTurns >= max) {
        return this.fail(
          o,
          `En fazla ${max} yönetici adımına ulaşıldı. Ayarlardan artırabilir ya da hedefi bölebilirsin.`
        )
      }

      // 1) Yöneticiye sor
      const step = this.addStep(o, { kind: 'manager', agentId: manager.id, status: 'running' })
      this.emit(o)
      const run = await this.runs.start(
        data,
        manager,
        this.buildPrompt(o, data, team, correction),
        { orchId: o.id }
      )
      step.runId = run.id
      this.emit(o)
      const done = await this.runs.waitFor(run.id)
      correction = undefined
      if (!this.alive(o)) return
      step.status = done.status
      if (done.status !== 'done') {
        if (done.limitHit) {
          step.text = 'Yöneticinin abonelik limiti doldu.'
          return this.ask(o, {
            kind: 'limit',
            text: `Yönetici (${manager.name}) abonelik limitine takıldı. Limit yenilenince "Devam et" de ya da yöneticinin motorunu değiştirip devam et.`
          })
        }
        return this.fail(o, `Yönetici çalışması başarısız: ${done.error ?? done.status}`)
      }
      const out = this.runs.output(run.id)
      const action = extractAction(out)
      const prose = tail(
        out.replace(/```[\s\S]*?```/g, '').replace(/\[çıkış kodu:[^\]]*\]/g, ''),
        800
      )
      step.text = prose || undefined

      if (!action) {
        const fails = (this.parseFails.get(o.id) ?? 0) + 1
        this.parseFails.set(o.id, fails)
        if (fails >= MAX_PARSE_FAILS)
          return this.fail(o, 'Yöneticinin yanıtı üst üste okunamadı (json eylem bloğu yok).')
        this.addStep(o, {
          kind: 'note',
          text: 'Yanıtında json eylem bloğu bulunamadı; tekrar isteniyor.'
        })
        this.emit(o)
        correction =
          'Önceki yanıtında json eylem bloğu yoktu. Yanıtını mutlaka tek bir ```json bloğuyla bitir.'
        continue
      }
      this.parseFails.set(o.id, 0)
      this.emit(o)

      // 2) Eylemi uygula
      if (action.action === 'finish') {
        o.status = 'done'
        o.summary = action.summary ?? prose
        o.endedAt = Date.now()
        return this.emit(o)
      }
      if (action.action === 'ask_user') {
        return this.ask(o, {
          kind: 'question',
          text: action.question ?? 'Yönetici bir soru sormak istiyor.'
        })
      }
      const raw =
        action.action === 'assign_parallel'
          ? (action.assignments ?? [])
          : [{ agent: action.agent ?? '', task: action.task ?? '' }]
      const assignments: Assignment[] = []
      const unknown: string[] = []
      for (const r of raw) {
        const ag = this.resolveAgent(data, o, r.agent)
        if (!ag || !r.task?.trim()) unknown.push(r.agent || '(boş)')
        else assignments.push({ agentId: ag.id, task: r.task.trim() })
      }
      if (unknown.length || !assignments.length) {
        const names = data.agents
          .filter((a) => a.teamId === o.teamId && !a.isManager)
          .map((a) => a.name)
        this.addStep(o, {
          kind: 'note',
          text: `Geçersiz görevlendirme: ${unknown.join(', ') || 'görev yok'}.`
        })
        this.emit(o)
        correction = `Geçersiz ajan adı ya da boş görev. Yalnızca şu adları kullan: ${names.join(', ')}.`
        continue
      }

      const needApproval = assignments.filter((a) => o.checkpoints.includes(a.agentId))
      if (needApproval.length) {
        const lines = assignments
          .map((a) => `• ${data.agents.find((x) => x.id === a.agentId)?.name}: ${a.task}`)
          .join('\n')
        return this.ask(o, {
          kind: 'approval',
          text: `Yönetici şu görev${assignments.length > 1 ? 'leri' : 'i'} vermek istiyor:\n${lines}`,
          pending: assignments
        })
      }
      await this.execute(o, assignments, false)
    }
  }

  private ask(o: Orchestration, q: Omit<OrchQuestion, 'id'>): void {
    o.status = 'waiting'
    o.question = { id: newId(), ...q }
    this.emit(o)
  }

  private async execute(
    o: Orchestration,
    assignments: Assignment[],
    approved: boolean
  ): Promise<void> {
    const data = loadData()
    const steps = assignments.map((a) =>
      this.addStep(o, {
        kind: 'task',
        agentId: a.agentId,
        task: a.task,
        status: 'running',
        text: approved ? 'Kullanıcı onayladı.' : undefined
      })
    )
    this.emit(o)
    const results = await Promise.all(
      assignments.map(async (a, i) => {
        const agent = data.agents.find((x) => x.id === a.agentId)
        if (!agent) return null
        const r = await this.runs.start(data, agent, a.task, { orchId: o.id })
        steps[i].runId = r.id
        this.emit(o)
        return this.runs.waitFor(r.id)
      })
    )
    if (!this.alive(o)) return
    let limitAgents: string[] = []
    results.forEach((r: RunInfo | null, i) => {
      const s = steps[i]
      if (!r) {
        s.status = 'error'
        s.text = 'Ajan bulunamadı.'
        return
      }
      s.status = r.status
      s.runId = r.id
      let text = tail(this.runs.output(r.id), RESULT_CHARS)
      if (r.outputFile) text += `\n(yanıt dosyası: outputs/${r.outputFile.split(/[\\/]/).pop()})`
      if (r.via) text = `[${r.via}]\n` + text
      if (r.limitHit) {
        limitAgents = [...limitAgents, data.agents.find((a) => a.id === r.agentId)?.name ?? '?']
        text = 'Abonelik limiti doldu; görev tamamlanamadı.\n' + text
      }
      s.text = text || '(çıktı yok)'
    })
    this.emit(o)
    if (limitAgents.length) {
      this.ask(o, {
        kind: 'limit',
        text: `${limitAgents.join(', ')} abonelik limitine takıldı. Ne yapılsın? (ör. "bekle ve tekrar dene", "Senarist yerine X'i kullan", "bu adımı atla")`
      })
    }
  }
}
