import { spawn, execFile, type ChildProcess } from 'child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Agent, AppData, RunDataEvent, RunInfo } from '../shared/types'
import { buildCliPlan, ROLE_FILE_PLACEHOLDER } from './engines/cli'
import { resolveCliPath } from './engines/detect'
import { apiCommandLine, runApi } from './engines/api'
import { getApiKey } from './secrets'
import { newId } from './store'
import { quoteArg, quoteWin } from './shellEnv'

type Send = (channel: string, payload: unknown) => void

const MAX_BUFFER = 400_000
const MAX_RUNS = 300

interface Live {
  info: RunInfo
  output: string
  child?: ChildProcess
  abort?: AbortController
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

export function resolveWorkdir(data: AppData, agent: Agent): string {
  const team = data.teams.find((t) => t.id === agent.teamId)
  return (agent.workdir && agent.workdir.trim()) || team?.workdir || process.cwd()
}

export class RunManager {
  private runs = new Map<string, Live>()

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

  async start(data: AppData, agent: Agent, prompt: string): Promise<RunInfo> {
    const workdir = resolveWorkdir(data, agent)
    const metaDir = join(workdir, '.ajangrid')
    const runsDir = join(metaDir, 'runs')
    mkdirSync(runsDir, { recursive: true })
    mkdirSync(join(workdir, 'outputs'), { recursive: true })

    const info: RunInfo = {
      id: newId(),
      agentId: agent.id,
      teamId: agent.teamId,
      prompt,
      status: 'running',
      commandLine: '',
      workdir,
      startedAt: Date.now()
    }
    const live: Live = { info, output: '' }
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
      this.send('run:update', { ...info })
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
        const plan = buildCliPlan(agent, prompt, workdir)
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
    const abort = new AbortController()
    live.abort = abort
    emit(`[istek gönderildi: ${provider} · ${agent.model}]\n`, 'system')
    runApi(agent, prompt, key, abort.signal)
      .then((res) => {
        const outFile = join(workdir, 'outputs', `${slug(agent.name)}-${stamp()}.md`)
        writeFileSync(outFile, res.text, 'utf8')
        emit(res.text + '\n', 'stdout')
        if (res.usage)
          emit(`\n[token: girdi ${res.usage.input} · çıktı ${res.usage.output}]\n`, 'system')
        emit(`[kaydedildi: outputs/${outFile.split(/[\\/]/).pop()}]\n`, 'system')
        finish({ status: 'done', exitCode: 0, outputFile: outFile })
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
  }

  stopAll(): void {
    for (const id of this.runs.keys()) this.stop(id)
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
      if (r.info.status !== 'running') this.runs.delete(id)
    }
  }
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}
