import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  Agent,
  AgentProposal,
  ApiKeyStatus,
  AppData,
  Assignment,
  CliDetection,
  CliId,
  Effort,
  EngineKind,
  OrchAnswer,
  OrchQuestion,
  OrchStep,
  Orchestration,
  RunInfo,
  StartGoalOptions
} from '../shared/types'
import { API_LABELS, CLI_LABELS } from '../shared/types'
import { goalsDir, loadData, newId, titleOf, update, workRoot } from './store'
import { attachNote, copyInto, newGoalDir } from './files'
import { detectClis } from './engines/detect'
import { apiKeyStatuses } from './secrets'
import { restore, snapshot } from './snapshots'
import type { RunManager } from './runner'

type Send = (channel: string, payload: unknown) => void
export type OrchEvent = 'question' | 'done' | 'error'
type Hook = (kind: OrchEvent, o: Orchestration) => void

const RESULT_CHARS = 2500
const DEFAULT_MAX_STEPS = 30
const MAX_PARSE_FAILS = 3

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*\u0007/g

interface RawProposal {
  name?: string
  title?: string
  role?: string
  engine?: string
  cli?: string
  apiProvider?: string
  localTool?: string
  model?: string
  effort?: string
  permissions?: Partial<Record<'write' | 'shell' | 'network', boolean>>
  mcpServers?: string[]
}

interface ManagerAction {
  action: 'assign' | 'assign_parallel' | 'ask_user' | 'finish' | 'create_agents'
  agent?: string
  task?: string
  assignments?: Array<{ agent: string; task: string }>
  question?: string
  summary?: string
  agents?: RawProposal[]
}

interface EngineInfo {
  clis: CliDetection[]
  keys: ApiKeyStatus[]
}

const COLORS = [
  '#93c5fd',
  '#f9a8d4',
  '#fcd34d',
  '#6ee7b7',
  '#fdba74',
  '#67e8f9',
  '#bef264',
  '#c4b5fd'
]
const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
const MAX_PROPOSALS = 8

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
  private loaded = false
  private hooks: Hook[] = []

  /** Bildirim ve Telegram gibi dış kanallar için olay dinleyicisi. */
  onEvent(fn: Hook): void {
    this.hooks.push(fn)
  }

  private fire(kind: OrchEvent, o: Orchestration): void {
    for (const h of this.hooks) {
      try {
        h(kind, structuredClone(o))
      } catch (err) {
        console.error('[orch hook]', err)
      }
    }
  }

  get(id: string): Orchestration | undefined {
    return this.orchs.get(id)
  }

  findByPrefix(prefix: string): Orchestration | undefined {
    if (prefix.length < 6) return undefined
    return [...this.orchs.values()].find((o) => o.id.startsWith(prefix))
  }

  /** Süren (çalışan ya da yanıt bekleyen) döngüler. */
  active(): Orchestration[] {
    return [...this.orchs.values()].filter((o) => o.status === 'running' || o.status === 'waiting')
  }

  constructor(
    private runs: RunManager,
    private send: Send,
    private onDataChanged: () => void
  ) {}

  private file(o: Orchestration): string {
    mkdirSync(goalsDir(), { recursive: true })
    return join(goalsDir(), `${o.id}.json`)
  }

  private emit(o: Orchestration): void {
    try {
      writeFileSync(this.file(o), JSON.stringify(o, null, 2), 'utf8')
    } catch {
      /* kayıt yazılamazsa akışı bozma */
    }
    this.send('orch:update', structuredClone(o))
  }

  /** Tüm hedefler (ilk çağrıda diskten yüklenir). */
  list(): Orchestration[] {
    if (!this.loaded) {
      this.loaded = true
      const dir = goalsDir()
      if (existsSync(dir)) {
        for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
          try {
            const o = JSON.parse(readFileSync(join(dir, n), 'utf8')) as Orchestration
            if (this.orchs.has(o.id) || !o.workdir) continue
            if (o.status === 'running' || o.status === 'waiting') {
              o.status = 'stopped'
              o.error = 'Uygulama kapandığında yarım kaldı.'
            }
            o.title = o.title || titleOf(o.goal)
            this.orchs.set(o.id, o)
          } catch {
            /* bozuk kayıt */
          }
        }
      }
    }
    return [...this.orchs.values()].sort((a, b) => a.startedAt - b.startedAt)
  }

  start(goal: string, opts: StartGoalOptions = {}): Orchestration {
    this.list()
    const data = loadData()
    const manager = data.agents.find((a) => a.isManager)
    if (!manager)
      throw new Error('Yönetici yok. Ajanlar ekranında bir ajanı "Yönetici" olarak işaretle.')
    const workdir =
      opts.workdir && opts.workdir.trim() ? opts.workdir : newGoalDir(workRoot(data), goal)
    mkdirSync(workdir, { recursive: true })
    const rel = copyInto(workdir, opts.files)
    const o: Orchestration = {
      id: newId(),
      managerId: manager.id,
      title: titleOf(goal),
      goal: goal + attachNote(rel),
      workdir,
      status: 'running',
      steps: [],
      checkpoints: data.settings.checkpoints ?? [],
      startedAt: Date.now()
    }
    this.orchs.set(o.id, o)
    this.emit(o)
    void this.loop(o)
    return structuredClone(o)
  }

  /**
   * Hedefin sohbetine yazılan mesaj: yanıt bekleniyorsa yanıt olur,
   * hedef bitmiş/durmuşsa yeni talimatla kaldığı yerden devam eder.
   */
  message(id: string, text: string, files: string[] = []): void {
    const o = this.orchs.get(id)
    if (!o) throw new Error('Hedef bulunamadı.')
    if (o.status === 'running')
      throw new Error('Yönetici şu an çalışıyor; bitmesini bekle ya da durdur.')
    const rel = copyInto(o.workdir, files)
    const body = (text.trim() + attachNote(rel)).trim()
    if (!body) return
    if (o.status === 'waiting') return this.answer(id, { text: body })
    this.resume(id, body)
  }

  /** Hedef kaydını siler (klasördeki dosyalara dokunmaz). */
  remove(id: string): void {
    const o = this.orchs.get(id)
    if (!o) return
    this.stop(id)
    this.orchs.delete(id)
    try {
      rmSync(this.file(o), { force: true })
    } catch {
      /* yoksay */
    }
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
    if (ans.files?.length) {
      const rel = copyInto(o.workdir, ans.files)
      ans = { ...ans, text: ((ans.text ?? '') + attachNote(rel)).trim() }
    }
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
    if (q.kind === 'team' && ans.approve && q.proposals) {
      const names = this.createAgents(q.proposals)
      this.addStep(o, {
        kind: 'user',
        text: ans.text ? `Yeni ajanlar onaylandı. Not: ${ans.text}` : 'Yeni ajanlar onaylandı.'
      })
      this.addStep(o, { kind: 'note', text: `Oluşturulan ajanlar: ${names.join(', ')}` })
      this.emit(o)
      void this.loop(o)
      return
    }
    const text = (ans.text ?? '').trim()
    if (q.kind === 'team') {
      this.addStep(o, {
        kind: 'user',
        text: `Ajan önerisi onaylanmadı.${text ? ' Düzeltme: ' + text : ''}`
      })
      this.emit(o)
      void this.loop(o)
      return
    }
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
    this.fire('error', o)
  }

  /** Durmuş ya da hata vermiş bir döngüyü kaldığı yerden sürdürür. */
  resume(id: string, instruction?: string): void {
    const o = this.orchs.get(id)
    if (!o || o.status === 'running' || o.status === 'waiting') return
    if (o.status === 'done' && o.summary) {
      this.addStep(o, {
        kind: 'note',
        text: `Hedef daha önce tamamlanmıştı. Sonuç özeti: ${o.summary}`
      })
    }
    o.summary = undefined
    for (const s of o.steps) {
      if (s.status === 'running') {
        s.status = 'stopped'
        s.text = s.text || 'Yarıda kaldı.'
      }
    }
    o.status = 'running'
    o.error = undefined
    o.endedAt = undefined
    o.question = undefined
    o.turnOffset = o.steps.filter((s) => s.kind === 'manager').length
    this.parseFails.set(o.id, 0)
    if (instruction) {
      this.addStep(o, { kind: 'user', text: instruction })
    } else {
      this.addStep(o, {
        kind: 'note',
        text: 'Kaldığı yerden devam ediliyor. Yarıda kalan adımların çıktıları eksik olabilir; klasördeki dosyaları kontrol et.'
      })
    }
    this.emit(o)
    void this.loop(o)
  }

  /** Klasörü bir adımdan önceki haline döndürür (döngü dururken). */
  async restoreStep(id: string, stepId: string): Promise<void> {
    const o = this.orchs.get(id)
    if (!o) throw new Error('Döngü bulunamadı.')
    if (o.status === 'running') throw new Error('Önce döngüyü durdur ya da bitmesini bekle.')
    const step = o.steps.find((s) => s.id === stepId)
    if (!step?.snap) throw new Error('Bu adım için anlık görüntü yok.')
    const agentName = loadData().agents.find((a) => a.id === step.agentId)?.name ?? 'ajan'
    await restore(o.workdir, step.snap)
    this.addStep(o, {
      kind: 'note',
      text: `Klasör, "${agentName}" adımından önceki haline döndürüldü. (Geri almadan önceki hal de kaydedildi.)`
    })
    // Geri alınan dosyaları hatırlayan oturumlar artık yanıltıcı olur
    o.sessions = {}
    this.emit(o)
  }

  private engineSection(data: AppData, eng: EngineInfo): string[] {
    const cliModels: Record<string, string> = {
      claude: 'model: opus | sonnet | haiku',
      codex: 'model: boş bırak (varsayılan)',
      antigravity: 'model: boş bırak (varsayılan)',
      gemini: 'eski; yalnızca API anahtarıyla çalışır'
    }
    const clis = eng.clis
      .filter((c) => c.path && c.id !== 'grok')
      .map((c) => `cli "${c.id}" (${c.label}; ${cliModels[c.id] ?? ''})`)
    const apis = eng.keys
      .filter((k) => k.hasKey)
      .map((k) => `api "${k.provider}" (${k.label}; model adı gerekli)`)
    const tools = data.localTools.map((t) => `local "${t.name}"`)
    const mcp = (data.settings.mcpServers ?? []).map((m) => m.name)
    return [
      '## Kullanılabilir motorlar (yeni ajan önerirken yalnızca bunları kullan)',
      `- CLI (abonelik, tercih edilir): ${clis.join(', ') || 'yok'}`,
      `- API (ücretli): ${apis.join(', ') || 'yok'}`,
      `- Yerel araçlar: ${tools.join(', ') || 'yok'}`,
      `- MCP sunucuları (yalnızca cli "claude" ajanlarına, "mcpServers":["ad"] ile): ${mcp.join(', ') || 'yok'}`,
      ''
    ]
  }

  private buildPrompt(
    o: Orchestration,
    data: AppData,
    eng: EngineInfo,
    correction?: string
  ): string {
    const members = data.agents.filter((a) => !a.isManager)
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
    const files = listFiles(o.workdir)

    return [
      'Sen yöneticisin. Kullanıcının hedefini, aşağıdaki ajan havuzundan bu işe uygun olanları seçip onlara iş vererek tamamlamalısın.',
      'İşi kendin yapma: her adımı en uygun ajana ver, çıktısını değerlendir, yetersizse aynı ajana somut düzeltme görevi ver. Hedefle ilgisi olmayan ajanları kullanma.',
      '',
      '## Hedef',
      o.goal,
      '',
      '## Ajan havuzu',
      ...(members.length
        ? members.map((a) => `- ${a.name}: ${a.title || '(unvan yok)'} — ${engineText(a, data)}`)
        : ['(henüz alt ajan yok: önce create_agents ile bu hedefe uygun ajanlar öner)']),
      '',
      ...this.engineSection(data, eng),
      '## Bu hedefin çalışma klasörü',
      `${o.workdir}`,
      'Ajanlar dosyaları bu klasörde okur ve yazar. Görev verirken okunacak ve yazılacak dosya adlarını açıkça belirt (ör. "ozet.md dosyasını oku, senaryo.md dosyasına yaz").',
      'API ajanları dosya yazamaz; yanıtları otomatik olarak outputs/ klasörüne kaydedilir.',
      'Ajanlar birbirini görmez; her görev tek başına anlaşılır olmalı. İstisna: Claude Code ajanları bu hedef boyunca kendi önceki görevlerini hatırlar, onlardan düzeltme isterken yalnızca değişecek kısmı söylemen yeterli.',
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
      '{"action":"create_agents","agents":[{"name":"<kısa ad>","title":"<ne yapar, tek cümle>","role":"<ayrıntılı talimat>","engine":"cli|api|local","cli":"claude|codex|antigravity","apiProvider":"anthropic|openai|google|openrouter","localTool":"<yerel araç adı>","model":"<model>","effort":"low|medium|high|xhigh|max","permissions":{"write":true,"shell":false,"network":false}}]}',
      '   ← havuzda bu iş için uygun ajan yoksa; kullanıcı onaylayınca oluşturulur. Gereken en az izni ver, ağır işler dışında düşük/orta efor seç.',
      '{"action":"finish","summary":"<kullanıcıya sonuç özeti; üretilen dosyaları belirt>"}',
      correction ? `\nÖNEMLİ: ${correction}` : ''
    ]
      .filter((l) => l !== null)
      .join('\n')
  }

  private resolveAgent(data: AppData, name: string | undefined): Agent | undefined {
    if (!name) return undefined
    const norm = (s: string): string => s.toLocaleLowerCase('tr').replace(/\s+/g, '')
    return data.agents.find((a) => !a.isManager && (norm(a.name) === norm(name) || a.id === name))
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
      const manager =
        data.agents.find((a) => a.id === o.managerId) ?? data.agents.find((a) => a.isManager)
      if (!manager) return this.fail(o, 'Yönetici silinmiş. Bir ajanı yönetici olarak işaretle.')
      o.managerId = manager.id
      const managerTurns = o.steps.filter((s) => s.kind === 'manager').length - (o.turnOffset ?? 0)
      if (managerTurns >= max) {
        return this.fail(
          o,
          `En fazla ${max} yönetici adımına ulaşıldı. Ayarlardan artırabilir ya da hedefi bölebilirsin.`
        )
      }

      // 1) Yöneticiye sor
      const step = this.addStep(o, { kind: 'manager', agentId: manager.id, status: 'running' })
      this.emit(o)
      const eng: EngineInfo = { clis: await detectClis().catch(() => []), keys: apiKeyStatuses() }
      const run = await this.runs.start(data, manager, this.buildPrompt(o, data, eng, correction), {
        orchId: o.id,
        workdir: o.workdir
      })
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
        this.emit(o)
        return this.fire('done', o)
      }
      if (action.action === 'create_agents') {
        const eng: EngineInfo = { clis: await detectClis().catch(() => []), keys: apiKeyStatuses() }
        const proposals = this.normalizeProposals(data, action.agents ?? [], eng)
        if (!proposals.length) {
          this.addStep(o, { kind: 'note', text: 'Ajan önerisi boş ya da geçersizdi.' })
          this.emit(o)
          correction =
            'create_agents listesi boş ya da geçersizdi. Her ajan için en az name, engine ve role ver.'
          continue
        }
        return this.ask(o, {
          kind: 'team',
          text: `Yönetici havuza ${proposals.length} yeni ajan eklemek istiyor. İncele; onaylarsan oluşturulur ve iş devam eder.`,
          proposals
        })
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
        const ag = this.resolveAgent(data, r.agent)
        if (!ag || !r.task?.trim()) unknown.push(r.agent || '(boş)')
        else assignments.push({ agentId: ag.id, task: r.task.trim() })
      }
      if (unknown.length || !assignments.length) {
        const names = data.agents.filter((a) => !a.isManager).map((a) => a.name)
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

  private normalizeProposals(data: AppData, raw: RawProposal[], eng: EngineInfo): AgentProposal[] {
    const existing = new Set(data.agents.map((a) => a.name.toLocaleLowerCase('tr')))
    const out: AgentProposal[] = []
    for (const r of raw.slice(0, MAX_PROPOSALS)) {
      const name = (r.name ?? '').trim().slice(0, 40)
      if (!name || !(r.role ?? r.title)) continue
      if (existing.has(name.toLocaleLowerCase('tr'))) continue
      existing.add(name.toLocaleLowerCase('tr'))
      const warnings: string[] = []
      const engine: EngineKind = r.engine === 'api' || r.engine === 'local' ? r.engine : 'cli'
      const p: AgentProposal = {
        name,
        title: (r.title ?? '').trim(),
        role: (r.role ?? r.title ?? '').trim(),
        engine,
        model: (r.model ?? '').trim(),
        effort: EFFORTS.includes(r.effort as Effort) ? (r.effort as Effort) : 'medium',
        permissions: {
          write: r.permissions?.write ?? true,
          shell: r.permissions?.shell ?? false,
          network: r.permissions?.network ?? false
        }
      }
      if (engine === 'cli') {
        const cli = (
          ['claude', 'codex', 'antigravity', 'gemini'].includes(r.cli ?? '') ? r.cli : 'claude'
        ) as CliId
        p.cli = cli
        if (!eng.clis.find((c) => c.id === cli)?.path)
          warnings.push(`${cli} bu bilgisayarda bulunamadı`)
        if (cli !== 'claude' && /^(opus|sonnet|haiku)$/i.test(p.model)) p.model = ''
        const known = (data.settings.mcpServers ?? []).map((m) => m.name)
        const mcp = (r.mcpServers ?? []).filter((n) => known.includes(n))
        if (cli === 'claude' && mcp.length) p.mcpServers = mcp
      } else if (engine === 'api') {
        const prov = (
          ['anthropic', 'openai', 'google', 'openrouter'].includes(r.apiProvider ?? '')
            ? r.apiProvider
            : 'anthropic'
        ) as AgentProposal['apiProvider']
        p.apiProvider = prov
        if (!eng.keys.find((k) => k.provider === prov)?.hasKey)
          warnings.push(`${prov} API anahtarı yok`)
        if (!p.model) warnings.push('model adı yok')
      } else {
        const tool = data.localTools.find(
          (t) => t.name.toLocaleLowerCase('tr') === (r.localTool ?? '').toLocaleLowerCase('tr')
        )
        if (tool) p.localToolId = tool.id
        else warnings.push(`yerel araç bulunamadı: ${r.localTool ?? '?'}`)
      }
      if (warnings.length) p.warnings = warnings
      out.push(p)
    }
    return out
  }

  private createAgents(proposals: AgentProposal[]): string[] {
    const names: string[] = []
    update((d) => {
      let i = d.agents.length
      for (const p of proposals) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { warnings, ...rest } = p
        d.agents.push({
          ...rest,
          id: newId(),
          isManager: false,
          color: COLORS[i++ % COLORS.length],
          createdAt: Date.now() + i
        })
        names.push(p.name)
      }
    })
    this.onDataChanged()
    return names
  }

  private ask(o: Orchestration, q: Omit<OrchQuestion, 'id'>): void {
    o.status = 'waiting'
    o.question = { id: newId(), ...q }
    this.emit(o)
    this.fire('question', o)
  }

  private async execute(
    o: Orchestration,
    assignments: Assignment[],
    approved: boolean
  ): Promise<void> {
    const data = loadData()
    // Görevlerden önce klasörün anlık görüntüsü: adım geri alınabilsin
    const names = assignments
      .map((a) => data.agents.find((x) => x.id === a.agentId)?.name ?? '?')
      .join(', ')
    const snap = await snapshot(o.workdir, `Adım öncesi: ${names}`)
    o.sessions = o.sessions ?? {}
    const usedSession = new Set<string>()
    const steps = assignments.map((a) =>
      this.addStep(o, {
        snap: snap ?? undefined,
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
        // Claude Code ajanları aynı hedef boyunca aynı oturumda çalışır (bağlam korunur).
        // Aynı ajan bu turda iki kez görev aldıysa ikincisi ayrı oturum açar.
        let session: { sessionId: string; resume: boolean } | undefined
        if (agent.engine === 'cli' && agent.cli === 'claude' && !usedSession.has(agent.id)) {
          usedSession.add(agent.id)
          const existing = o.sessions?.[agent.id]
          session = existing
            ? { sessionId: existing, resume: true }
            : { sessionId: randomUUID(), resume: false }
        }
        const r = await this.runs.start(data, agent, a.task, {
          orchId: o.id,
          workdir: o.workdir,
          ...session
        })
        steps[i].runId = r.id
        this.emit(o)
        const done = await this.runs.waitFor(r.id)
        if (session && o.sessions) {
          if (done.status === 'done' && !done.via) o.sessions[agent.id] = session.sessionId
          else if (session.resume) delete o.sessions[agent.id] // oturum açılamadıysa bir dahakine yeniden başla
        }
        return done
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
