import { useEffect, useState } from 'react'
import type { ApiKeyStatus, ApiProvider, CliDetection, LocalTool } from '../../../shared/types'
import { Plus, Refresh, Trash } from '../components/Icons'
import { useStore } from '../store'
import { cleanError } from '../util'

function ToolCard({
  tool,
  onDelete
}: {
  tool: LocalTool
  onDelete: () => void
}): React.JSX.Element {
  const [t, setT] = useState(tool)
  const [saved, setSaved] = useState(true)
  const save = async (): Promise<void> => {
    await window.api.tools.save(t)
    setSaved(true)
  }
  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <label
          htmlFor={`tn-${t.id}`}
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)'
          }}
        >
          Araç adı
        </label>
        <input
          id={`tn-${t.id}`}
          className="inp"
          style={{ fontWeight: 600 }}
          value={t.name}
          onChange={(e) => (setT({ ...t, name: e.target.value }), setSaved(false))}
        />
        <button className="ib" aria-label="Aracı sil" onClick={onDelete}>
          <Trash />
        </button>
      </div>
      <label className="lbl" htmlFor={`tt-${t.id}`}>
        Komut şablonu
      </label>
      <textarea
        id={`tt-${t.id}`}
        className="inp mono"
        rows={3}
        style={{ fontSize: 12 }}
        value={t.template}
        onChange={(e) => (setT({ ...t, template: e.target.value }), setSaved(false))}
      />
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span className="hint">{t.note}</span>
        <button className="btn btn-sm" onClick={save} disabled={saved}>
          {saved ? 'Kaydedildi' : 'Kaydet'}
        </button>
      </div>
    </div>
  )
}

export function EnginesView(): React.JSX.Element {
  const { data } = useStore()
  const [clis, setClis] = useState<CliDetection[] | null>(null)
  const [keys, setKeys] = useState<ApiKeyStatus[]>([])
  const [editing, setEditing] = useState<ApiProvider | null>(null)
  const [keyText, setKeyText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [scanning, setScanning] = useState(true)

  const scan = async (force: boolean): Promise<void> => {
    setScanning(true)
    setClis(await window.api.clis.detect(force))
    setScanning(false)
  }
  useEffect(() => {
    window.api.clis.detect(false).then((list) => {
      setClis(list)
      setScanning(false)
    })
    window.api.keys.list().then(setKeys)
  }, [])

  const saveKey = async (p: ApiProvider): Promise<void> => {
    try {
      setKeys(await window.api.keys.set(p, keyText))
      setEditing(null)
      setKeyText('')
      setErr(null)
    } catch (e) {
      setErr(cleanError(e))
    }
  }

  const addTool = (): void => {
    window.api.tools.save({
      id: '',
      name: 'Yeni araç',
      template: '',
      note: 'Yer tutucular: {prompt} {prompt_file} {workdir} {out_dir}'
    })
  }

  const usedBy = (p: ApiProvider): string =>
    data?.agents
      .filter((a) => a.engine === 'api' && a.apiProvider === p)
      .map((a) => a.name)
      .join(', ') || '—'

  return (
    <main
      className="scroll"
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        boxSizing: 'border-box',
        padding: '22px 30px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Motorlar ve Limitler</h1>
          <span className="hint">
            Ajanların kullanabileceği her şey: abonelikli CLI araçları, API anahtarları ve yerel
            araçlar.
          </span>
        </div>
        <button className="btn" onClick={() => scan(true)} disabled={scanning}>
          <Refresh /> {scanning ? 'Taranıyor…' : 'Bilgisayarı yeniden tara'}
        </button>
      </header>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>CLI araçları</h2>
          <span className="badge b-cli">abonelik limitleri</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12
          }}
        >
          {(clis ?? []).map((c) => (
            <div key={c.id} className="card">
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                <span className="dot" style={{ background: c.path ? '#34d399' : '#71717a' }} />
              </div>
              <div className="mono hint" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                {c.path ?? `${c.bin} · bulunamadı`}
              </div>
              <div style={{ fontSize: 12, color: c.path ? 'var(--green-fg)' : 'var(--muted)' }}>
                {c.path ? (c.version ?? 'sürüm okunamadı') : 'Kurulu değil'}
              </div>
              {!c.path ? (
                <div className="mono hint" style={{ fontSize: 11 }}>
                  {c.installHint}
                </div>
              ) : null}
              <div className="hint">
                Limit takibi: sonraki sürümde (CLI&apos;ın verdiği ölçüde).
              </div>
            </div>
          ))}
          {!clis ? <div className="hint">Taranıyor…</div> : null}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>API anahtarları</h2>
          <span className="badge b-api">kullandıkça öde</span>
        </div>
        <div style={{ border: '1px solid var(--w08)', borderRadius: 12, overflowX: 'auto' }}>
          <table className="tbl" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th>Sağlayıcı</th>
                <th>Anahtar</th>
                <th>Kullanan ajanlar</th>
                <th style={{ width: 280 }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.provider}>
                  <td style={{ fontWeight: 500 }}>{k.label}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {k.hasKey ? `••••${k.hint}` : 'eklenmedi'}
                  </td>
                  <td>{usedBy(k.provider)}</td>
                  <td>
                    {editing === k.provider ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <label
                          htmlFor={`key-${k.provider}`}
                          style={{
                            position: 'absolute',
                            width: 1,
                            height: 1,
                            overflow: 'hidden',
                            clip: 'rect(0 0 0 0)'
                          }}
                        >
                          {k.label} API anahtarı
                        </label>
                        <input
                          id={`key-${k.provider}`}
                          type="password"
                          className="inp"
                          style={{ minHeight: 30, padding: '4px 8px', fontSize: 13 }}
                          value={keyText}
                          onChange={(e) => setKeyText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && saveKey(k.provider)}
                          autoFocus
                        />
                        <button
                          className="btn btn-sm btn-p"
                          onClick={() => saveKey(k.provider)}
                          disabled={!keyText.trim()}
                        >
                          Kaydet
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => (setEditing(null), setKeyText(''))}
                        >
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => setEditing(k.provider)}>
                          {k.hasKey ? 'Değiştir' : 'Ekle'}
                        </button>
                        {k.hasKey ? (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={async () => setKeys(await window.api.keys.remove(k.provider))}
                          >
                            Kaldır
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {err ? (
          <span className="hint" style={{ color: 'var(--red-fg)' }}>
            {err}
          </span>
        ) : null}
        <span className="hint">
          Anahtarlar işletim sisteminin şifreleme servisiyle (macOS Keychain / Windows DPAPI)
          şifrelenerek saklanır ve arayüze geri gönderilmez.
          {keys[0] && !keys[0].encryptionAvailable
            ? ' Bu sistemde şifreleme kullanılamıyor; anahtar eklenemez.'
            : ''}
        </span>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Yerel araçlar ve modeller</h2>
            <span className="badge b-loc">ücretsiz</span>
          </div>
          <button className="btn" onClick={addTool}>
            <Plus /> Araç tanımla
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12
          }}
        >
          {data?.localTools.map((t) => (
            <ToolCard key={t.id} tool={t} onDelete={() => window.api.tools.remove(t.id)} />
          ))}
        </div>
        <span className="hint">
          Yer tutucular: <span className="mono">{'{prompt}'}</span> görev metni,{' '}
          <span className="mono">{'{prompt_file}'}</span> görevin yazıldığı dosya,{' '}
          <span className="mono">{'{workdir}'}</span> çalışma klasörü,{' '}
          <span className="mono">{'{out_dir}'}</span> çıktı klasörü. Örnek:{' '}
          <span className="mono">
            tts --file {'{prompt_file}'} --out {'{out_dir}'}/ses.wav
          </span>
        </span>
      </section>
    </main>
  )
}
