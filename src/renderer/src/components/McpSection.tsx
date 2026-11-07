import { useState } from 'react'
import type { McpServer } from '../../../shared/types'
import { useStore } from '../store'
import { Plus, Trash } from './Icons'

function envToText(env?: Record<string, string>): string {
  return Object.entries(env ?? {})
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')
}

function textToEnv(t: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of t.split('\n')) {
    const i = line.indexOf('=')
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

/** Basit argüman ayrıştırma: boşlukla ayrılır, tırnak içi korunur. */
function splitArgs(s: string): string[] {
  return (s.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map((a) => a.replace(/^["']|["']$/g, ''))
}

function ServerCard({
  server,
  onSave,
  onDelete
}: {
  server: McpServer
  onSave: (m: McpServer) => void
  onDelete: () => void
}): React.JSX.Element {
  const [name, setName] = useState(server.name)
  const [kind, setKind] = useState<'stdio' | 'http'>(server.url ? 'http' : 'stdio')
  const [cmd, setCmd] = useState([server.command, ...(server.args ?? [])].filter(Boolean).join(' '))
  const [url, setUrl] = useState(server.url ?? '')
  const [env, setEnv] = useState(envToText(server.env))
  const [dirty, setDirty] = useState(false)
  const nameOk = /^[A-Za-z0-9_-]{1,40}$/.test(name)
  const mark =
    <T,>(fn: (v: T) => void) =>
    (v: T): void => {
      fn(v)
      setDirty(true)
    }

  const save = (): void => {
    if (!nameOk) return
    const parts = splitArgs(cmd)
    onSave(
      kind === 'http'
        ? { name, url: url.trim() }
        : { name, command: parts[0] ?? '', args: parts.slice(1), env: textToEnv(env) }
    )
    setDirty(false)
  }

  return (
    <div className="card" style={{ gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label htmlFor={`mn-${server.name}`} className="sr">
          Sunucu adı
        </label>
        <input
          id={`mn-${server.name}`}
          className="inp mono"
          style={{ fontWeight: 600 }}
          value={name}
          onChange={(e) => mark(setName)(e.target.value)}
        />
        <select
          className="inp"
          aria-label="Tür"
          style={{ width: 110 }}
          value={kind}
          onChange={(e) => mark(setKind)(e.target.value as 'stdio' | 'http')}
        >
          <option value="stdio">Komut</option>
          <option value="http">HTTP</option>
        </select>
        <button className="ib" aria-label="Sunucuyu sil" onClick={onDelete}>
          <Trash />
        </button>
      </div>
      {!nameOk ? (
        <span className="hint" style={{ color: 'var(--red-fg)' }}>
          Ad yalnızca harf, rakam, - ve _ içerebilir.
        </span>
      ) : null}
      {kind === 'stdio' ? (
        <>
          <label className="lbl" htmlFor={`mc-${server.name}`}>
            Komut
          </label>
          <input
            id={`mc-${server.name}`}
            className="inp mono"
            style={{ fontSize: 12 }}
            placeholder="ör. npx -y @modelcontextprotocol/server-filesystem /Users/tbs/Belgeler"
            value={cmd}
            onChange={(e) => mark(setCmd)(e.target.value)}
          />
          <label className="lbl" htmlFor={`me-${server.name}`}>
            Ortam değişkenleri (her satıra ANAHTAR=değer)
          </label>
          <textarea
            id={`me-${server.name}`}
            className="inp mono"
            rows={2}
            style={{ fontSize: 12 }}
            value={env}
            onChange={(e) => mark(setEnv)(e.target.value)}
          />
        </>
      ) : (
        <>
          <label className="lbl" htmlFor={`mu-${server.name}`}>
            Adres
          </label>
          <input
            id={`mu-${server.name}`}
            className="inp mono"
            style={{ fontSize: 12 }}
            placeholder="https://…/mcp"
            value={url}
            onChange={(e) => mark(setUrl)(e.target.value)}
          />
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-sm" onClick={save} disabled={!dirty || !nameOk}>
          {dirty ? 'Kaydet' : 'Kaydedildi'}
        </button>
      </div>
    </div>
  )
}

/** Motorlar ekranı: ajanlara bağlanabilecek MCP sunucuları. */
export function McpSection(): React.JSX.Element {
  const { data } = useStore()
  const list = data?.settings.mcpServers ?? []

  const saveAll = (next: McpServer[]): void => {
    window.api.settings.set({ mcpServers: next })
  }

  const add = (): void => {
    let n = list.length + 1
    while (list.some((m) => m.name === `sunucu-${n}`)) n++
    saveAll([...list, { name: `sunucu-${n}`, command: '', args: [] }])
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>MCP sunucuları</h2>
        <button className="btn" onClick={add}>
          <Plus /> Sunucu ekle
        </button>
      </div>
      <span className="hint">
        Ajanların dış araçlara (n8n, Google Drive, veritabanı…) erişmesi için. Tanımladığın sunucuyu
        Ajanlar ekranında istediğin Claude Code ajanına bağla. Diğer CLI&apos;larda MCP, CLI&apos;ın
        kendi ayarından yapılır.
      </span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 12
        }}
      >
        {list.map((m, i) => (
          <ServerCard
            key={`${i}-${m.name}`}
            server={m}
            onSave={(nm) => {
              const next = list.slice()
              next[i] = nm
              // Ad değiştiyse ajanlardaki bağlantılar eski adla kalır; kullanıcı ajanı yeniden bağlamalı
              saveAll(next)
            }}
            onDelete={() => saveAll(list.filter((_, j) => j !== i))}
          />
        ))}
      </div>
    </section>
  )
}
