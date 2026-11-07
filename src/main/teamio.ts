import type { Agent, AppData, LocalTool, McpServer, Team } from '../shared/types'
import { newId } from './store'

// Ekip şablonu dosyası (*.ajangrid.json): ekip, ajanlar, kullandıkları yerel araçlar
// ve MCP sunucuları. Kimlikler ve klasör yolları taşınmaz; gizli değerler çıkarılır.

export interface TeamFile {
  ajangrid: 1
  name: string
  checkpoints: string[]
  agents: Array<
    Omit<Agent, 'id' | 'teamId' | 'createdAt' | 'localToolId' | 'workdir'> & { localTool?: string }
  >
  localTools: Array<Omit<LocalTool, 'id'>>
  mcpServers: McpServer[]
}

export function exportTeam(data: AppData, teamId: string): TeamFile {
  const team = data.teams.find((t) => t.id === teamId)
  if (!team) throw new Error('Ekip bulunamadı.')
  const agents = data.agents
    .filter((a) => a.teamId === teamId)
    .sort((a, b) => a.createdAt - b.createdAt)
  const toolIds = new Set(agents.map((a) => a.localToolId).filter(Boolean))
  const mcpNames = new Set(agents.flatMap((a) => a.mcpServers ?? []))
  return {
    ajangrid: 1,
    name: team.name,
    checkpoints: (team.checkpoints ?? [])
      .map((id) => agents.find((a) => a.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
    agents: agents.map((a) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, teamId: _t, createdAt, localToolId, workdir, ...rest } = a
      const tool = data.localTools.find((t) => t.id === localToolId)
      return { ...rest, ...(tool ? { localTool: tool.name } : {}) }
    }),
    localTools: data.localTools
      .filter((t) => toolIds.has(t.id))
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .map(({ id, ...rest }) => rest),
    // Ortam değişkeni değerleri (anahtarlar, parolalar) dışa aktarılmaz
    mcpServers: (data.settings.mcpServers ?? [])
      .filter((m) => mcpNames.has(m.name))
      .map((m) => ({
        ...m,
        env: m.env ? Object.fromEntries(Object.keys(m.env).map((k) => [k, ''])) : undefined
      }))
  }
}

/** Şablonu veriye ekler (yerinde değiştirir) ve oluşan ekibi döner. */
export function importTeam(
  data: AppData,
  raw: unknown,
  workdir: string
): { team: Team; warnings: string[] } {
  const f = raw as Partial<TeamFile>
  if (!f || f.ajangrid !== 1 || !Array.isArray(f.agents) || !f.name) {
    throw new Error('Bu dosya bir AjanGrid ekip şablonu değil.')
  }
  const warnings: string[] = []
  const team: Team = { id: newId(), name: String(f.name).slice(0, 60), workdir, checkpoints: [] }

  // Yerel araçlar: aynı adlı araç varsa onu kullan, yoksa ekle
  const toolIdByName = new Map<string, string>()
  for (const t of f.localTools ?? []) {
    if (!t?.name) continue
    const existing = data.localTools.find((x) => x.name === t.name)
    if (existing) {
      toolIdByName.set(t.name, existing.id)
      if (existing.template !== t.template)
        warnings.push(`"${t.name}" aracı zaten vardı; mevcut komut şablonu kullanıldı.`)
    } else {
      const id = newId()
      data.localTools.push({ id, name: t.name, template: t.template ?? '', note: t.note })
      toolIdByName.set(t.name, id)
      warnings.push(`"${t.name}" yerel aracı eklendi; komut yolunu bu bilgisayara göre kontrol et.`)
    }
  }

  // MCP sunucuları: aynı adlı yoksa ekle
  data.settings.mcpServers = data.settings.mcpServers ?? []
  for (const m of f.mcpServers ?? []) {
    if (!m?.name || data.settings.mcpServers.some((x) => x.name === m.name)) continue
    data.settings.mcpServers.push(m)
    if (m.env && Object.keys(m.env).length)
      warnings.push(`"${m.name}" MCP sunucusunun ortam değişkenlerini Motorlar ekranından doldur.`)
  }

  const now = Date.now()
  const created: Agent[] = []
  f.agents.forEach((a, i) => {
    if (!a?.name) return
    const { localTool, ...rest } = a
    const agent: Agent = {
      ...(rest as Omit<Agent, 'id' | 'teamId' | 'createdAt'>),
      id: newId(),
      teamId: team.id,
      createdAt: now + i,
      permissions: a.permissions ?? { write: true, shell: false, network: false },
      localToolId: localTool ? toolIdByName.get(localTool) : undefined
    }
    if (agent.engine === 'local' && !agent.localToolId)
      warnings.push(`"${agent.name}" için yerel araç bulunamadı.`)
    created.push(agent)
  })
  // Tek yönetici kuralı
  let seenManager = false
  for (const a of created) {
    if (a.isManager) {
      if (seenManager) a.isManager = false
      seenManager = true
    }
  }
  team.checkpoints = (f.checkpoints ?? [])
    .map((n) => created.find((a) => a.name === n)?.id)
    .filter((x): x is string => Boolean(x))
  data.teams.push(team)
  data.agents.push(...created)
  return { team, warnings }
}
