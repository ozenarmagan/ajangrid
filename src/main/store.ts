import { app } from 'electron'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Agent, AppData, LocalTool, Orchestration } from '../shared/types'

const file = (): string => join(app.getPath('userData'), 'ajangrid.json')

/** Hedef kayıtlarının tutulduğu klasör */
export const goalsDir = (): string => join(app.getPath('userData'), 'hedefler')

export function workRoot(data: AppData): string {
  return (
    (data.settings.workRoot && data.settings.workRoot.trim()) ||
    join(homedir(), 'AjanGrid', 'isler')
  )
}

export function defaultManager(): Agent {
  return {
    id: randomUUID(),
    name: 'Yönetici',
    title: 'Görevi planlar, uygun ajanlara dağıtır ve çıktıları denetler',
    role: 'Sen yöneticisin. Verilen hedefi adımlara böl, her adımı en uygun ajana ver, çıktıları kontrol et ve gerekirse düzeltme iste.',
    isManager: true,
    color: '#c4b5fd',
    engine: 'cli',
    cli: 'claude',
    model: 'opus',
    effort: 'high',
    permissions: { write: true, shell: false, network: false },
    createdAt: Date.now()
  }
}

function defaultData(): AppData {
  const tools: LocalTool[] = [
    {
      id: randomUUID(),
      name: 'ffmpeg (örnek)',
      template: 'ffmpeg -version',
      note: 'Kendi montaj komutunla değiştir.'
    }
  ]
  return {
    version: 2,
    agents: [defaultManager()],
    localTools: tools,
    settings: { theme: 'dark' }
  }
}

// ---------- v1 (ekipli) → v2 (tek yönetici + ortak havuz) ----------

interface V1Team {
  id: string
  name: string
  workdir: string
  checkpoints?: string[]
}
interface V1Data {
  version: 1
  teams: V1Team[]
  agents: Array<Agent & { teamId: string }>
  localTools: LocalTool[]
  settings: AppData['settings'] & { activeTeamId?: string | null }
}

function migrateV1(old: V1Data): AppData {
  // Eski dosyanın yedeği
  try {
    copyFileSync(file(), file().replace(/\.json$/, '.v1-yedek.json'))
  } catch {
    /* yedek alınamazsa da devam */
  }
  const teams = old.teams ?? []
  const teamName = (id: string): string => teams.find((t) => t.id === id)?.name ?? 'ekip'
  const active = old.settings.activeTeamId ?? teams[0]?.id
  const managers = old.agents.filter((a) => a.isManager)
  const keepManager = managers.find((a) => a.teamId === active) ?? managers[0]
  const used = new Set<string>()
  const agents: Agent[] = []
  for (const a of old.agents) {
    if (a.isManager && a.id !== keepManager?.id) continue // diğer ekiplerin yöneticileri (yedekte duruyor)

    const { teamId, ...rest } = a
    let name = a.name
    const key = (n: string): string => n.toLocaleLowerCase('tr')
    if (used.has(key(name))) name = `${a.name} (${teamName(teamId)})`
    let i = 2
    while (used.has(key(name))) name = `${a.name} ${i++}`
    used.add(key(name))
    agents.push({ ...rest, name })
  }
  if (!agents.some((a) => a.isManager)) agents.unshift(defaultManager())
  const checkpoints = [...new Set(teams.flatMap((t) => t.checkpoints ?? []))].filter((id) =>
    agents.some((a) => a.id === id)
  )
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { activeTeamId, ...settings } = old.settings
  const schedules = (settings.schedules ?? []).map((s) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { teamId, ...rest } = s as typeof s & { teamId?: string }
    return rest
  })

  // Eski hedef kayıtlarını merkezi klasöre taşı (dosyalar ekip klasöründe kalır)
  mkdirSync(goalsDir(), { recursive: true })
  for (const t of teams) {
    const dir = join(t.workdir, '.ajangrid', 'yonetici')
    if (!existsSync(dir)) continue
    for (const n of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      try {
        const o = JSON.parse(readFileSync(join(dir, n), 'utf8')) as Orchestration & {
          teamId?: string
        }
        delete o.teamId
        o.workdir = t.workdir
        o.title = o.title || titleOf(o.goal)
        if (!agents.some((a) => a.id === o.managerId) && keepManager) o.managerId = keepManager.id
        writeFileSync(join(goalsDir(), `${o.id}.json`), JSON.stringify(o, null, 2), 'utf8')
      } catch {
        /* bozuk kayıt */
      }
    }
  }
  return {
    version: 2,
    agents,
    localTools: old.localTools ?? [],
    settings: { ...settings, schedules, checkpoints }
  }
}

export function titleOf(goal: string): string {
  const first = goal.trim().split(/\n/)[0].trim()
  return first.length > 60 ? first.slice(0, 57) + '…' : first || 'Hedef'
}

let cache: AppData | null = null

export function loadData(): AppData {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const parsed = JSON.parse(readFileSync(file(), 'utf8'))
      if (parsed && parsed.version === 2 && Array.isArray(parsed.agents)) {
        cache = parsed as AppData
        return cache
      }
      if (parsed && parsed.version === 1 && Array.isArray(parsed.agents)) {
        cache = migrateV1(parsed as V1Data)
        saveData(cache)
        return cache
      }
    }
  } catch (err) {
    console.error('[store] okunamadı, varsayılanlarla başlanıyor', err)
  }
  cache = defaultData()
  saveData(cache)
  return cache
}

export function saveData(data: AppData): void {
  cache = data
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  // Yarım yazılmış dosya kalmasın diye önce geçici dosyaya yaz, sonra taşı
  const tmp = file() + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, file())
}

export function update(mutator: (d: AppData) => void): AppData {
  const data = structuredClone(loadData())
  mutator(data)
  saveData(data)
  return data
}

export function newId(): string {
  return randomUUID()
}
