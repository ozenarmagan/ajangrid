import { spawn, execFile, type ChildProcess } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agent, AppData, RunDataEvent, RunInfo } from '../shared/types'
import { buildCliPlan, ROLE_FILE_PLACEHOLDER } from './engines/cli'
import { resolveCliPath } from './engines/detect'
import { apiCommandLine, runApi } from './engines/api'
import { getApiKey } from './secrets'
import { loadData, newId, workRoot } from './store'
import { apiCostToday, costOf, looksLikeLimit, recordApi, recordCli } from './usage'
import { quoteArg, quoteWin } from './shellEnv'

type Send = (channel: string, payload: unknown) => void

const MAX_BUFFER = 400_000
const MAX_RUNS = 300

interface Live {
  info: RunInfo
  output: string
  child?: ChildProcess
  abort?: AbortController
  agent: Agent
}

export interface StartOptions {
  orchId?: string
  /** Hedefin çalışma klasörü (ajanın kendi klasörü yoksa kullanılır) */
  workdir?: string
  via?: string
  /** Claude Code oturumu: aynı hedefte bağlamı korumak için */
  sessionId?: string
  resume?: boolean
}

function slug(s: string): string {
  return (
    s
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'ajan'
  )
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

/** Hedef dışında (elle) çalıştırılan ajanların klasörü */
export function freeWorkdir(data: AppData): string {
  return join(workRoot(data), 'serbest')
}

export function resolveWorkdir(data: AppData, agent: Agent, fallback?: string): string {
  return (agent.workdir && agent.workdir.trim()) || fallback || freeWorkdir(data)
}

export class RunManager {
  private runs = new Map<string, Live>()
  private waiters = new Map<string, Array<(r: RunInfo) => void>>()
  private timers = new Set<NodeJS.Timeout>()

  constructor(private send: Send) {}

  list(): RunInfo[] {
    return [...this.runs.values()].map((r) => r.info).sort((a, b) => a.startedAt - b.startedAt)
  }

  output(runId: string): string {
    return this.runs.get(runId)?.output ?? ''
  }

  /** Arayüzde gösterilecek komut önizlemesi; hiçbir şey çalıştırmaz. */
  preview(data: AppData, agent: Agent): { command: string; notes: string[] } {
    const workdir = resolveWorkdir(data, agent)
    if (agent.engine === 'api')
      return {
        command: apiCommandLine(agent),
        notes: ['API ajanları dosya yazamaz; yanıt outputs/ klasörüne kaydedilir.']
      }
    if (agent.engine === 'local') {
      const tool = data.localTools.find((t) => t.id === agent.localToolId)
      return {
        command: tool ? tool.template : '(yerel araç seçilmedi)',
        notes: ['Yer tutucular: {prompt}, {prompt_file}, {workdir}, {out_dir}']
      }
    }
    const plan = buildCliPlan(agent, '{görev}', workdir)
    const cmd =
      plan.shellCommand ?? [plan.bin, ...plan.args].map((a) => quoteArg(String(a))).join(' ')
    return { command: `cd ${quoteArg(workdir)}\n${cmd} < görev.txt`, notes: plan.notes }
  }

  /** Çalışma (ve limit nedeniyle yerine başlatılanlar) bitince çözülür. */
  waitFor(runId: string): Promise<RunInfo> {
    const live = this.runs.get(runId)
    if (live && live.info.status !== 'running' && !live.info.replacedBy)
      return Promise.resolve({ ...live.info })
    if (live?.info.replacedBy) return this.waitFor(live.info.replacedBy)
    return new Promise((resolve) => {
      const list = this.waiters.get(runId) ?? []
      list.push(resolve)
      this.waiters.set(runId, list)
    })
  }

  private settle(info: RunInfo): void {
    const list = this.waiters.get(info.id)
    if (!list) return
    this.waiters.delete(info.id)
    if (info.replacedBy) {
      // Bekleyenleri yedek çalışmaya devret
      const next = this.waiters.get(info.replacedBy) ?? []
      this.waiters.set(info.replacedBy, [...next, ...list])
      const nl = this.runs.get(info.replacedBy)
      if (nl && nl.info.status !== 'running') this.settle(nl.info)
      return
    }
    list.forEach((fn) => fn({ ...info }))
  }

  /** Limit dolduysa ajanın yedek ayarına göre davran. */
  private handleLimit(live: Live): boolean {
    const fb = live.agent.fallback
    const info = live.info
    if (!fb || fb.mode === 'none' || fb.mode === 'ask') return false
    const data = loadData()
    if (fb.mode === 'api') {
      if (!fb.model || !fb.apiProvider) return false
      const clone: Agent = {
        ...live.agent,
        engine: 'api',
        apiProvider: fb.apiProvider,
        model: fb.model
      }
      const via = `Limit doldu → API yedeği: ${fb.apiProvider} · ${fb.model}`
      const pending = this.start(data, clone, info.prompt, {
        orchId: info.orchId,
        workdir: info.workdir,
        via
      })
      pending.then((r) => {
        info.replacedBy = r.id
        this.send('run:update', { ...info })
        this.settle(info)
      })
      return true
    }
    if (fb.mode === 'wait') {
      const mins = Math.max(1, fb.waitMinutes ?? 30)
      this.send('run:data', {
        runId: info.id,
        agentId: info.agentId,
        chunk: `\n[limit doldu: ${mins} dk sonra tekrar denenecek]\n`,
        stream: 'system'
      } satisfies RunDataEvent)
      // Bekleyenler, yeniden deneme bitene kadar beklemeye devam etsin
      const placeholder = newId()
      info.replacedBy = placeholder
      const t = setTimeout(async () => {
        this.timers.delete(t)
        const agent = loadData().agents.find((a) => a.id === live.agent.id) ?? live.agent
        const r = await this.start(loadData(), agent, info.prompt, {
          orchId: info.orchId,
          workdir: info.workdir,
          via: 'Limit sonrası yeniden deneme'
        })
        info.replacedBy = r.id
        const w = this.waiters.get(placeholder)
        if (w) {
          this.waiters.delete(placeholder)
          this.waiters.set(r.id, [...(this.waiters.get(r.id) ?? []), ...w])
        }
        this.send('run:update', { ...info })
      }, mins * 60_000)
      this.timers.add(t)
      const list = this.waiters.get(info.id)
      if (list) {
        this.waiters.delete(info.id)
        this.waiters.set(placeholder, list)
      }
      return true
    }
    return false
  }

  async start(
    data: AppData,
    agent: Agent,
    prompt: string,
    opts: StartOptions = {}
  ): Promise<RunInfo> {
    const workdir = resolveWorkdir(data, agent, opts.workdir)
    const metaDir = join(workdir, '.ajangrid')
    const runsDir = join(metaDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    mkdirSync(join(workdir, 'outputs'), { recursive: true })

    const info: RunInfo = {
      id: newId(),
      agentId: agent.id,
      prompt,
      status: 'running',
      commandLine: '',
      workdir,
      startedAt: Date.now(),
      orchId: opts.orchId,
      via: opts.via
    }
    const live: Live = { info, output: '', agent }
    this.runs.set(info.id, live)
    this.trim()
    const logFile = join(runsDir, `${stamp()}-${slug(agent.name)}-${info.id.slice(0, 8)}.log`)
    writeFileSync(logFile, `# ${agent.name}\n# görev:\n${prompt}\n\n`, 'utf8')

    const emit = (chunk: string, stream: RunDataEvent['stream']): void => {
      live.output = (live.output + chunk).slice(-MAX_BUFFER)
      try {
        appendFileSync(logFile, chunk)
      } catch {
        /* log yazılamazsa çalışmayı bozma */
      }
      this.send('run:data', {
        runId: info.id,
        agentId: agent.id,
        chunk,
        stream
      } satisfies RunDataEvent)
    }
    const finish = (patch: Partial<RunInfo>): void => {
      if (info.status !== 'running') return
      Object.assign(info, { endedAt: Date.now(), ...patch })
      const st = info.status as RunInfo['status']
      if (agent.engine === 'cli' && st !== 'stopped') {
        const limit = (st === 'error' || live.output.length < 1500) && looksLikeLimit(live.output)
        recordCli(agent.cli ?? 'claude', limit)
        if (limit) {
          info.limitHit = true
          info.status = 'error'
          info.error = 'Abonelik limiti doldu'
        }
      }
      this.send('run:update', { ...info })
      const handled = info.limitHit ? this.handleLimit(live) : false
      if (!handled) this.settle(info)
    }

    try {
      if (agent.engine === 'api') {
        info.commandLine = apiCommandLine(agent)
        this.send('run:update', { ...info })
        await this.startApi(agent, prompt, workdir, live, emit, finish)
      } else if (agent.engine === 'local') {
        const tool = data.localTools.find((t) => t.id === agent.localToolId)
        if (!tool) throw new Error('Bu ajana bir yerel araç atanmamış.')
        const promptFile = join(metaDir, `gorev-${info.id.slice(0, 8)}.txt`)
        writeFileSync(promptFile, prompt, 'utf8')
        const cmd = tool.template
          .replaceAll('{prompt_file}', quoteArg(promptFile))
          .replaceAll('{prompt}', quoteArg(prompt))
          .replaceAll('{workdir}', quoteArg(workdir))
          .replaceAll('{out_dir}', quoteArg(join(workdir, 'outputs')))
        info.commandLine = tool.template
        this.send('run:update', { ...info })
        this.spawnShell(cmd, '', workdir, live, emit, finish)
      } else {
        // MCP sunucuları (Claude Code): yapılandırma dosyasını yaz
        let mcpConfigFile: string | undefined
        const mcpNames = (agent.mcpServers ?? []).filter((n) =>
          data.settings.mcpServers?.some((m) => m.name === n)
        )
        if (agent.cli === 'claude' && mcpNames.length) {
          const servers: Record<string, unknown> = {}
          for (const m of data.settings.mcpServers ?? []) {
            if (!mcpNames.includes(m.name)) continue
            servers[m.name] = m.url
              ? { type: 'http', url: m.url }
              : { command: m.command, args: m.args ?? [], env: m.env ?? {} }
          }
          mcpConfigFile = join(metaDir, `mcp-${slug(agent.name)}.json`)
          writeFileSync(mcpConfigFile, JSON.stringify({ mcpServers: servers }, null, 2), {
            encoding: 'utf8',
            mode: 0o600
          })
        }
        const plan = buildCliPlan(agent, prompt, workdir, {
          sessionId: opts.sessionId,
          resume: opts.resume,
          mcpConfigFile,
          mcpServers: mcpNames
        })
        let args = plan.args
        if (plan.roleFileContent) {
          const roleFile = join(metaDir, `rol-${slug(agent.name)}.md`)
          writeFileSync(roleFile, plan.roleFileContent, 'utf8')
          args = args.map((a) => (a === ROLE_FILE_PLACEHOLDER ? roleFile : a))
        }
        if (plan.bin) {
          const path = await resolveCliPath(plan.bin)
          if (!path)
            throw new Error(`"${plan.bin}" bulunamadı. Motorlar ekranından kurulumu kontrol et.`)
          info.commandLine = [plan.bin, ...args].map(quoteArg).join(' ')
          this.send('run:update', { ...info })
          this.spawnBin(path, args, plan.stdin, workdir, live, emit, finish)
        } else {
          if (!plan.shellCommand) throw new Error('Özel CLI için komut şablonu boş.')
          info.commandLine = plan.shellCommand
          this.send('run:update', { ...info })
          this.spawnShell(plan.shellCommand, plan.stdin, workdir, live, emit, finish)
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      emit(`\n[hata] ${msg}\n`, 'system')
      finish({ status: 'error', error: msg })
    }
    return { ...info }
  }

  private async startApi(
    agent: Agent,
    prompt: string,
    workdir: string,
    live: Live,
    emit: (c: string, s: RunDataEvent['stream']) => void,
    finish: (p: Partial<RunInfo>) => void
  ): Promise<void> {
    const provider = agent.apiProvider ?? 'anthropic'
    const key = getApiKey(provider)
    if (!key) throw new Error(`${provider} için API anahtarı eklenmemiş (Motorlar ekranı).`)
    const settings = loadData().settings
    const cap = settings.apiDailyCapUsd?.[provider] ?? 0
    if (cap > 0 && apiCostToday(provider) >= cap) {
      throw new Error(`${provider} için günlük harcama tavanına ($${cap}) ulaşıldı.`)
    }
    const abort = new AbortController()
    live.abort = abort
    emit(`[istek gönderildi: ${provider} · ${agent.model}]\n`, 'system')
    runApi(agent, prompt, key, abort.signal)
      .then((res) => {
        const outFile = join(workdir, 'outputs', `${slug(agent.name)}-${stamp()}.md`)
        writeFileSync(outFile, res.text, 'utf8')
        emit(res.text + '\n', 'stdout')
        let usage: RunInfo['usage']
        if (res.usage) {
          const cost = costOf(settings, provider, res.usage.input, res.usage.output)
          recordApi(provider, res.usage.input, res.usage.output, cost)
          usage = { ...res.usage, costUsd: cost }
          const c = cost !== undefined ? ` · ~$${cost.toFixed(4)}` : ''
          emit(`\n[token: girdi ${res.usage.input} · çıktı ${res.usage.output}${c}]\n`, 'system')
        }
        emit(`[kaydedildi: outputs/${outFile.split(/[\\/]/).pop()}]\n`, 'system')
        finish({ status: 'done', exitCode: 0, outputFile: outFile, usage })
      })
      .catch((err: Error) => {
        if (abort.signal.aborted) return finish({ status: 'stopped' })
        emit(`\n[hata] ${err.message}\n`, 'system')
        finish({ status: 'error', error: err.message })
      })
  }

  private attach(
    child: ChildProcess,
    stdin: string,
    live: Live,
    emit: (c: string, s: RunDataEvent['stream']) => void,
    finish: (p: Partial<RunInfo>) => void
  ): void {
    live.child = child
    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (d: string) => emit(d, 'stdout'))
    child.stderr?.on('data', (d: string) => emit(d, 'stderr'))
    child.on('error', (err) => {
      emit(`\n[hata] ${err.message}\n`, 'system')
      finish({ status: 'error', error: err.message })
    })
    child.on('close', (code) => {
      if (live.info.status !== 'running') return
      emit(`\n[çıkış kodu: ${code ?? '—'}]\n`, 'system')
      finish({
        status: code === 0 ? 'done' : 'error',
        exitCode: code,
        error: code === 0 ? undefined : `Çıkış kodu ${code}`
      })
    })
    child.stdin?.on('error', () => {
      /* süreç stdin'i okumadan kapanırsa EPIPE yut */
    })
    child.stdin?.end(stdin)
  }

  private spawnBin(
    path: string,
    args: string[],
    stdin: string,
    cwd: string,
    live: Live,
    emit: (c: string, s: RunDataEvent['stream']) => void,
    finish: (p: Partial<RunInfo>) => void
  ): void {
    const env = { ...process.env }
    if (process.platform === 'win32') {
      // .cmd kabukları (npm global) yalnızca cmd.exe üzerinden çalışır
      const line = [quoteWin(path), ...args.map(quoteWin)].join(' ')
      this.attach(
        spawn(line, { cwd, env, shell: true, windowsHide: true }),
        stdin,
        live,
        emit,
        finish
      )
    } else {
      this.attach(spawn(path, args, { cwd, env, detached: true }), stdin, live, emit, finish)
    }
  }

  private spawnShell(
    command: string,
    stdin: string,
    cwd: string,
    live: Live,
    emit: (c: string, s: RunDataEvent['stream']) => void,
    finish: (p: Partial<RunInfo>) => void
  ): void {
    const child = spawn(command, {
      cwd,
      env: { ...process.env },
      shell: true,
      windowsHide: true,
      detached: process.platform !== 'win32'
    })
    this.attach(child, stdin, live, emit, finish)
  }

  stop(runId: string): void {
    const live = this.runs.get(runId)
    if (!live || live.info.status !== 'running') return
    live.abort?.abort()
    const child = live.child
    if (child?.pid) {
      if (process.platform === 'win32') {
        execFile(
          'taskkill',
          ['/pid', String(child.pid), '/T', '/F'],
          { windowsHide: true },
          () => undefined
        )
      } else {
        try {
          process.kill(-child.pid, 'SIGTERM')
        } catch {
          child.kill('SIGTERM')
        }
      }
    }
    live.info.status = 'stopped'
    live.info.endedAt = Date.now()
    this.send('run:update', { ...live.info })
    this.settle(live.info)
  }

  stopAll(): void {
    for (const t of this.timers) clearTimeout(t)
    this.timers.clear()
    for (const id of this.runs.keys()) this.stop(id)
  }

  /** Belirli bir yönetici döngüsüne ait süren çalışmaları durdur. */
  stopOrch(orchId: string): void {
    for (const r of this.runs.values()) if (r.info.orchId === orchId) this.stop(r.info.id)
  }

  clearFinished(agentId?: string): void {
    for (const [id, r] of this.runs) {
      if (r.info.status !== 'running' && (!agentId || r.info.agentId === agentId))
        this.runs.delete(id)
    }
  }

  private trim(): void {
    if (this.runs.size <= MAX_RUNS) return
    for (const [id, r] of this.runs) {
      if (this.runs.size <= MAX_RUNS) break
      if (r.info.status !== 'running' && !this.waiters.has(id)) this.runs.delete(id)
    }
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
