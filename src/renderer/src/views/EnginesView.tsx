import { useEffect, useState } from 'react'
import type {
  ApiKeyStatus,
  ApiProvider,
  CliDetection,
  CliId,
  LocalTool,
  UsageSummary
} from '../../../shared/types'
import { Plus, Refresh, Trash } from '../components/Icons'
import { useStore } from '../store'
import { cleanError, timeOf } from '../util'

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

function NumInput({
  id,
  label,
  value,
  onCommit,
  step = 0.01,
  width = 80
}: {
  id: string
  label: string
  value: number
  onCommit: (n: number) => void
  step?: number
  width?: number
}): React.JSX.Element {
  const [v, setV] = useState(String(value || ''))
  return (
    <>
      <label htmlFor={id} className="sr">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={step}
        className="inp"
        title={label}
        style={{ width, minHeight: 30, padding: '4px 8px', fontSize: 13 }}
        value={v}
        placeholder="0"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => onCommit(Math.max(0, Number(v) || 0))}
      />
    </>
  )
}

const usd = (n: number): string => (n ? `$${n.toFixed(n < 1 ? 4 : 2)}` : '—')
const tok = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n)

export function EnginesView(): React.JSX.Element {
  const { data, runs } = useStore()
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const finished = runs.filter((r) => r.status !== 'running').length
  useEffect(() => {
    window.api.usage.summary().then(setUsage)
  }, [finished])
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
              {(() => {
                const u = usage?.cli.find((x) => x.cli === (c.id as CliId))
                if (!u) return <div className="hint">Özel CLI ajanı olarak kullanılabilir.</div>
                return (
                  <div className="hint">
                    AjanGrid üzerinden: son 5 saatte <b>{u.runs5h}</b>, bugün <b>{u.runsToday}</b>{' '}
                    çalışma.
                    {u.lastLimitAt ? (
                      <span style={{ color: 'var(--amber-fg)' }}>
                        {' '}
                        Son limit uyarısı: {timeOf(u.lastLimitAt)}.
                      </span>
                    ) : null}
                  </div>
                )
              })()}
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
          <table className="tbl" style={{ minWidth: 1000 }}>
            <thead>
              <tr>
                <th>Sağlayıcı</th>
                <th>Anahtar</th>
                <th>Bugün</th>
                <th>Bu ay</th>
                <th>Fiyat $/1M (girdi · çıktı)</th>
                <th>Günlük tavan $</th>
                <th>Kullanan ajanlar</th>
                <th style={{ width: 260 }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.provider}>
                  <td style={{ fontWeight: 500 }}>{k.label}</td>
                  <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {k.hasKey ? `••••${k.hint}` : 'eklenmedi'}
                  </td>
                  {(() => {
                    const u = usage?.api.find((x) => x.provider === k.provider)
                    const price = data?.settings.apiPricing?.[k.provider] ?? { input: 0, output: 0 }
                    const cap = data?.settings.apiDailyCapUsd?.[k.provider] ?? 0
                    const setPrice = (patch: Partial<typeof price>): void => {
                      window.api.settings.set({
                        apiPricing: {
                          ...data?.settings.apiPricing,
                          [k.provider]: { ...price, ...patch }
                        }
                      })
                    }
                    return (
                      <>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {u ? `${tok(u.inputToday)} / ${tok(u.outputToday)}` : '—'}
                          <div className="hint">{u ? usd(u.costToday) : ''}</div>
                        </td>
                        <td>{u ? usd(u.costMonth) : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <NumInput
                              key={`pi-${k.provider}-${price.input}`}
                              id={`pi-${k.provider}`}
                              label={`${k.label} girdi fiyatı`}
                              value={price.input}
                              onCommit={(n) => setPrice({ input: n })}
                            />
                            <NumInput
                              key={`po-${k.provider}-${price.output}`}
                              id={`po-${k.provider}`}
                              label={`${k.label} çıktı fiyatı`}
                              value={price.output}
                              onCommit={(n) => setPrice({ output: n })}
                            />
                          </div>
                        </td>
                        <td>
                          <NumInput
                            key={`cap-${k.provider}-${cap}`}
                            id={`cap-${k.provider}`}
                            label={`${k.label} günlük tavan`}
                            value={cap}
                            step={0.5}
                            onCommit={(n) =>
                              window.api.settings.set({
                                apiDailyCapUsd: {
                                  ...data?.settings.apiDailyCapUsd,
                                  [k.provider]: n
                                }
                              })
                            }
                          />
                        </td>
                      </>
                    )
                  })()}
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
          Fiyatları sağlayıcının güncel fiyat sayfasından gir; girilmezse maliyet hesaplanmaz ve
          tavan uygulanmaz. Tavana ulaşılınca o sağlayıcıya o gün istek gönderilmez. Anahtarlar
          işletim sisteminin şifreleme servisiyle (macOS Keychain / Windows DPAPI) şifrelenerek
          saklanır ve arayüze geri gönderilmez.
          {keys[0] && !keys[0].encryptionAvailable
            ? ' Bu sistemde şifreleme kullanılamıyor; anahtar eklenemez.'
            : ''}
        </span>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Yönetici döngüsü</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="lbl">Bir hedefte en fazla yönetici adımı</span>
          <NumInput
            key={`max-${data?.settings.maxOrchestrationSteps ?? 30}`}
            id="max-steps"
            label="En fazla yönetici adımı"
            value={data?.settings.maxOrchestrationSteps ?? 30}
            step={1}
            onCommit={(n) =>
              window.api.settings.set({ maxOrchestrationSteps: Math.max(1, Math.round(n)) })
            }
          />
        </div>
        <span className="hint">
          Yönetici sonsuz döngüye girip aboneliğini tüketmesin diye üst sınır.
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
