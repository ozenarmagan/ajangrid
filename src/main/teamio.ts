import type { Agent, AppData, LocalTool, McpServer } from '../shared/types'
import { newId } from './store'

// Ajan paketi dosyası (*.ajangrid.json): ajanlar, kullandıkları yerel araçlar ve MCP
// sunucuları. Kimlikler ve klasör yolları taşınmaz; gizli değerler çıkarılır.
// Eski sürümün ekip dosyaları (ajangrid: 1) da içe aktarılabilir.

type AgentEntry = Omit<Agent, 'id' | 'createdAt' | 'localToolId' | 'workdir'> & {
  localTool?: string
}

export interface AgentPackFile {
  ajangrid: 1 | 2
  name: string
  checkpoints: string[]
  agents: AgentEntry[]
  localTools: Array<Omit<LocalTool, 'id'>>
  mcpServers: McpServer[]
}

/** Seçilen ajanları (boşsa yönetici dışındaki tümünü) dışa aktarır. */
export function exportAgents(data: AppData, ids?: string[]): AgentPackFile {
  const agents = data.agents
    .filter((a) => (ids?.length ? ids.includes(a.id) : !a.isManager))
    .sort((a, b) => a.createdAt - b.createdAt)
  const toolIds = new Set(agents.map((a) => a.localToolId).filter(Boolean))
  const mcpNames = new Set(agents.flatMap((a) => a.mcpServers ?? []))
  return {
    ajangrid: 2,
    name: 'AjanGrid ajanları',
    checkpoints: (data.settings.checkpoints ?? [])
      .map((id) => agents.find((a) => a.id === id)?.name)
      .filter((n): n is string => Boolean(n)),
    agents: agents.map((a) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, createdAt, localToolId, workdir, ...rest } = a
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

/** Paketteki ajanları havuza ekler (yerinde değiştirir). */
export function importAgents(data: AppData, raw: unknown): { added: string[]; warnings: string[] } {
  const f = raw as Partial<AgentPackFile>
  if (!f || (f.ajangrid !== 1 && f.ajangrid !== 2) || !Array.isArray(f.agents)) {
    throw new Error('Bu dosya bir AjanGrid ajan paketi değil.')
  }
  const warnings: string[] = []

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

  const used = new Set(data.agents.map((a) => a.name.toLocaleLowerCase('tr')))
  const hasManager = data.agents.some((a) => a.isManager)
  const now = Date.now()
  const created: Agent[] = []
  f.agents.forEach((a, i) => {
    if (!a?.name) return
    // Havuzda tek yönetici olur; paketteki yönetici atlanır
    if (a.isManager && (hasManager || created.some((c) => c.isManager))) {
      warnings.push(`"${a.name}" yönetici olduğu için eklenmedi (zaten bir yönetici var).`)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { localTool, teamId, ...rest } = a as AgentEntry & { teamId?: string }
    let name = a.name
    for (let n = 2; used.has(name.toLocaleLowerCase('tr')); n++) name = `${a.name} ${n}`
    if (name !== a.name) warnings.push(`"${a.name}" adı kullanılıyordu; "${name}" olarak eklendi.`)
    used.add(name.toLocaleLowerCase('tr'))
    const agent: Agent = {
      ...(rest as Omit<Agent, 'id' | 'createdAt'>),
      name,
      id: newId(),
      createdAt: now + i,
      permissions: a.permissions ?? { write: true, shell: false, network: false },
      localToolId: localTool ? toolIdByName.get(localTool) : undefined
    }
    if (agent.engine === 'local' && !agent.localToolId)
      warnings.push(`"${agent.name}" için yerel araç bulunamadı.`)
    created.push(agent)
  })
  const cps = (f.checkpoints ?? [])
    .map((n) => created.find((a) => a.name === n)?.id)
    .filter((x): x is string => Boolean(x))
  data.settings.checkpoints = [...(data.settings.checkpoints ?? []), ...cps]
  data.agents.push(...created)
  return { added: created.map((a) => a.name), warnings }
}
