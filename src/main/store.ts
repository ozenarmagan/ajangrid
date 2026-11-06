import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Agent, AppData, LocalTool, Team } from '../shared/types'

const file = (): string => join(app.getPath('userData'), 'ajangrid.json')

function defaultData(): AppData {
  const teamId = randomUUID()
  const workdir = join(homedir(), 'AjanGrid', 'varsayilan')
  const now = Date.now()
  const manager: Agent = {
    id: randomUUID(),
    teamId,
    name: 'Yönetici',
    title: 'Görevi planlar, alt ajanlara dağıtır ve çıktıları denetler',
    role: 'Sen bu ekibin yöneticisisin. Verilen hedefi adımlara böl, her adımı en uygun ajana ver, çıktıları kontrol et ve gerekirse düzeltme iste.',
    isManager: true,
    color: '#c4b5fd',
    engine: 'cli',
    cli: 'claude',
    model: 'opus',
    effort: 'high',
    permissions: { write: true, shell: false, network: false },
    createdAt: now
  }
  const tools: LocalTool[] = [
    {
      id: randomUUID(),
      name: 'ffmpeg (örnek)',
      template: 'ffmpeg -version',
      note: 'Kendi montaj komutunla değiştir.'
    }
  ]
  return {
    version: 1,
    teams: [{ id: teamId, name: 'Varsayılan ekip', workdir }],
    agents: [manager],
    localTools: tools,
    settings: { theme: 'dark', activeTeamId: teamId }
  }
}

let cache: AppData | null = null

export function loadData(): AppData {
  if (cache) return cache
  try {
    if (existsSync(file())) {
      const parsed = JSON.parse(readFileSync(file(), 'utf8')) as AppData
      if (parsed && parsed.version === 1 && Array.isArray(parsed.teams) && parsed.teams.length) {
        cache = parsed
        return parsed
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

export function teamOf(data: AppData, teamId: string): Team | undefined {
  return data.teams.find((t) => t.id === teamId)
}
