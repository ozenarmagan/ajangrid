import { useEffect, useState } from 'react'
import {
  API_LABELS,
  CLI_LABELS,
  EFFORT_LABELS,
  type Agent,
  type ApiProvider,
  type CliId,
  type Effort,
  type EngineKind
} from '../../../shared/types'
import { Folder, Trash } from '../components/Icons'
import { useActiveTeam, useStore } from '../store'
import { AGENT_COLORS, blankAgent, cleanError, initialOf } from '../util'

const MODEL_SUGGESTIONS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
  codex: [],
  gemini: [],
  custom: [],
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  openai: [],
  google: [],
  openrouter: []
}

interface Props {
  agentId: string | null
  onSaved: (id: string) => void
  onDeleted: () => void
  onTest: (id: string) => void
}

export function AgentEditor({ agentId, onSaved, onDeleted, onTest }: Props): React.JSX.Element {
  const { data } = useStore()
  const team = useActiveTeam()
  const existing = data?.agents.find((a) => a.id === agentId)
  const teamAgents = data?.agents.filter((a) => a.teamId === team?.id) ?? []
  const [draft, setDraft] = useState<Agent>(
    () => existing ?? blankAgent(team?.id ?? '', teamAgents.length)
  )
  const [preview, setPreview] = useState<{ command: string; notes: string[] }>({
    command: '',
    notes: []
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      window.api.runs
        .preview(draft)
        .then(setPreview)
        .catch(() => undefined)
    }, 200)
    return () => clearTimeout(t)
  }, [draft])

  const set = <K extends keyof Agent>(k: K, v: Agent[K]): void => {
    setDraft((d) => ({ ...d, [k]: v }))
    setDirty(true)
  }
  const setPerm = (k: keyof Agent['permissions'], v: boolean): void => {
    setDraft((d) => ({ ...d, permissions: { ...d.permissions, [k]: v } }))
    setDirty(true)
  }

  const validate = (): string | null => {
    if (!draft.name.trim()) return 'Ajan adı gerekli.'
    if (draft.engine === 'cli' && draft.cli === 'custom' && !draft.customCommand?.trim())
      return 'Özel CLI için komut şablonu gerekli.'
    if (draft.engine === 'api' && !draft.model.trim()) return 'API ajanı için model adı gerekli.'
    if (draft.engine === 'cli' && draft.fallback?.mode === 'api' && !draft.fallback.model?.trim())
      return 'API yedeği için model adı gerekli.'
    if (draft.engine === 'local' && !draft.localToolId)
      return 'Bir yerel araç seç (Motorlar ekranından tanımlanır).'
    return null
  }

  const save = async (): Promise<Agent | null> => {
    const err = validate()
    if (err) {
      setMsg(err)
      return null
    }
    try {
      const saved = await window.api.agents.save({
        ...draft,
        teamId: draft.teamId || team?.id || ''
      })
      setDraft(saved)
      setDirty(false)
      setMsg('Kaydedildi.')
      onSaved(saved.id)
      return saved
    } catch (e) {
      setMsg(cleanError(e))
      return null
    }
  }

  const duplicate = async (): Promise<void> => {
    const copy = { ...draft, id: '', createdAt: 0, isManager: false, name: `${draft.name} (kopya)` }
    const saved = await window.api.agents.save(copy)
    onSaved(saved.id)
  }

  const remove = async (): Promise<void> => {
    if (!draft.id) return
    if (!window.confirm(`"${draft.name}" ajanı silinsin mi?`)) return
    await window.api.agents.remove(draft.id)
    onDeleted()
  }

  const test = async (): Promise<void> => {
    const saved = dirty || !draft.id ? await save() : draft
    if (saved) onTest(saved.id)
  }

  const pickDir = async (): Promise<void> => {
    const dir = await window.api.dialog.pickFolder()
    if (dir) set('workdir', dir)
  }

  const engineSeg: Array<{ id: EngineKind; label: string }> = [
    { id: 'cli', label: 'CLI · abonelik' },
    { id: 'api', label: 'API · kullandıkça öde' },
    { id: 'local', label: 'Yerel araç / model' }
  ]
  const engineHint: Record<EngineKind, string> = {
    cli: 'Bilgisayarındaki CLI aracı kullanılır; ücretli aboneliğinin limitlerinden düşer.',
    api: 'API anahtarınla doğrudan çağrılır; kullandığın token kadar ücretlendirilir. Dosya yazamaz, yanıtı outputs/ klasörüne kaydedilir.',
    local: 'Bilgisayarındaki bir program ya da yerel model, komut şablonuyla çalıştırılır.'
  }
  const sugKey =
    draft.engine === 'api' ? (draft.apiProvider ?? 'anthropic') : (draft.cli ?? 'claude')
  const suggestions = MODEL_SUGGESTIONS[sugKey] ?? []

  return (
    <>
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
          gap: 20
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span
              className="avatar"
              style={{ background: draft.color, width: 44, height: 44, fontSize: 18 }}
            >
              {initialOf(draft.name || '?')}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
                {draft.name || 'Yeni ajan'}
              </h1>
              <span className="hint">
                {team?.name} ekibinde{draft.isManager ? ' · ekibin yöneticisi' : ''}
                {dirty ? ' · kaydedilmemiş değişiklik' : ''}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {msg ? (
              <span
                className="hint"
                style={{ color: msg === 'Kaydedildi.' ? 'var(--green-fg)' : 'var(--red-fg)' }}
              >
                {msg}
              </span>
            ) : null}
            <button className="btn" onClick={test}>
              Test et
            </button>
            {draft.id ? (
              <>
                <button className="btn" onClick={duplicate}>
                  Çoğalt
                </button>
                <button className="btn btn-danger" onClick={remove} aria-label="Sil">
                  <Trash />
                </button>
              </>
            ) : null}
            <button className="btn btn-p" onClick={save}>
              Kaydet
            </button>
          </div>
        </header>

        <section
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" htmlFor="ad">
              Ajan adı
            </label>
            <input
              id="ad"
              className="inp"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="ör. Senarist"
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" htmlFor="unvan">
              Görev unvanı (yöneticinin göreceği)
            </label>
            <input
              id="unvan"
              className="inp"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="ör. Özetten 60 sn video senaryosu yazar"
            />
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label className="lbl" htmlFor="rol">
            Rol ve talimatlar
          </label>
          <textarea
            id="rol"
            className="inp"
            rows={7}
            value={draft.role}
            onChange={(e) => set('role', e.target.value)}
            placeholder="Bu ajanın kim olduğunu, neyi nasıl yapacağını, hangi dosyaları okuyup hangi dosyaya yazacağını anlat."
          />
        </section>

        <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="chk">
            <input
              type="checkbox"
              checked={draft.isManager}
              onChange={(e) => set('isManager', e.target.checked)}
            />{' '}
            Bu ekibin yöneticisi
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="lbl">Renk</span>
            {AGENT_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Renk ${c}`}
                onClick={() => set('color', c)}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: c,
                  cursor: 'pointer',
                  border: draft.color === c ? '2px solid var(--text)' : '2px solid transparent'
                }}
              />
            ))}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="lbl">Motor</div>
          <div className="seg-group" role="group" aria-label="Motor türü">
            {engineSeg.map((s) => (
              <button
                key={s.id}
                className={`seg ${draft.engine === s.id ? 'on' : ''}`}
                aria-pressed={draft.engine === s.id}
                onClick={() => set('engine', s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="hint">{engineHint[draft.engine]}</div>
        </section>

        <section
          style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}
        >
          {draft.engine === 'cli' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="lbl" htmlFor="cli">
                CLI aracı
              </label>
              <select
                id="cli"
                className="inp"
                value={draft.cli}
                onChange={(e) => set('cli', e.target.value as CliId)}
              >
                {(Object.keys(CLI_LABELS) as CliId[]).map((c) => (
                  <option key={c} value={c}>
                    {CLI_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {draft.engine === 'api' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="lbl" htmlFor="prov">
                Sağlayıcı
              </label>
              <select
                id="prov"
                className="inp"
                value={draft.apiProvider}
                onChange={(e) => set('apiProvider', e.target.value as ApiProvider)}
              >
                {(Object.keys(API_LABELS) as ApiProvider[]).map((p) => (
                  <option key={p} value={p}>
                    {API_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {draft.engine === 'local' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="lbl" htmlFor="tool">
                Yerel araç
              </label>
              <select
                id="tool"
                className="inp"
                value={draft.localToolId ?? ''}
                onChange={(e) => set('localToolId', e.target.value)}
              >
                <option value="">Seç…</option>
                {data?.localTools.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="lbl" htmlFor="model">
                Model{' '}
                {draft.engine === 'cli' ? (
                  <span className="muted">(boş = CLI varsayılanı)</span>
                ) : null}
              </label>
              <input
                id="model"
                className="inp"
                list="model-sug"
                value={draft.model}
                onChange={(e) => set('model', e.target.value)}
                placeholder="model adı"
              />
              <datalist id="model-sug">
                {suggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              gridColumn: draft.engine === 'local' ? 'span 2' : undefined
            }}
          >
            <label className="lbl" htmlFor="klasor">
              Çalışma klasörü <span className="muted">(boş = ekip klasörü)</span>
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                id="klasor"
                className="inp mono"
                style={{ fontSize: 12 }}
                value={draft.workdir ?? ''}
                onChange={(e) => set('workdir', e.target.value)}
                placeholder={team?.workdir}
              />
              <button className="btn" aria-label="Klasör seç" onClick={pickDir}>
                <Folder />
              </button>
            </div>
          </div>
        </section>

        {draft.engine === 'cli' && draft.cli === 'custom' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="lbl" htmlFor="custom">
              Komut şablonu
            </label>
            <input
              id="custom"
              className="inp mono"
              style={{ fontSize: 13 }}
              value={draft.customCommand ?? ''}
              onChange={(e) => set('customCommand', e.target.value)}
              placeholder="ör. grok -m {model}"
            />
            <span className="hint">
              Yer tutucular: {'{model}'}, {'{effort}'}, {'{workdir}'}. Görev ve rol metni programa
              stdin üzerinden verilir.
            </span>
          </section>
        ) : null}

        {draft.engine !== 'local' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="lbl">Efor seviyesi</div>
            <div
              className="seg-group"
              role="group"
              aria-label="Efor seviyesi"
              style={{ maxWidth: 560 }}
            >
              {(Object.keys(EFFORT_LABELS) as Effort[]).map((e) => (
                <button
                  key={e}
                  className={`seg ${draft.effort === e ? 'on' : ''}`}
                  aria-pressed={draft.effort === e}
                  onClick={() => set('effort', e)}
                >
                  {EFFORT_LABELS[e]}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {draft.engine === 'cli' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 10 }}>
            <div className="lbl">İzinler</div>
            <label className="chk">
              <input
                type="checkbox"
                checked={draft.permissions.write}
                onChange={(e) => setPerm('write', e.target.checked)}
              />{' '}
              Çalışma klasörüne dosya yazabilir
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={draft.permissions.shell}
                onChange={(e) => setPerm('shell', e.target.checked)}
              />{' '}
              Terminal komutu çalıştırabilir
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={draft.permissions.network}
                onChange={(e) => setPerm('network', e.target.checked)}
              />{' '}
              İnternete erişebilir
            </label>
            <span className="hint">
              Ajanlar onay sormadan çalışır; bu izinler CLI&apos;ın kendi izin modlarına çevrilir.
              Yazma + komut birlikte açıksa ajan çalışma klasöründe her şeyi yapabilir — klasörü
              buna göre seç.
            </span>
          </section>
        ) : null}

        {draft.engine === 'cli' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 16 }}>
            <div className="lbl">Abonelik limiti dolunca</div>
            {(
              [
                ['none', 'Hata olarak bitir'],
                ['api', 'API yedeğine geç'],
                ['wait', 'Bekle ve tekrar dene'],
                ['ask', 'Yöneticiye / bana sor']
              ] as const
            ).map(([mode, label]) => (
              <label key={mode} className="chk">
                <input
                  type="radio"
                  name="fallback"
                  checked={(draft.fallback?.mode ?? 'none') === mode}
                  onChange={() => set('fallback', { ...draft.fallback, mode })}
                />{' '}
                {label}
              </label>
            ))}
            {draft.fallback?.mode === 'api' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 220px))',
                  gap: 10,
                  marginLeft: 24
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="lbl" htmlFor="fb-prov">
                    Sağlayıcı
                  </label>
                  <select
                    id="fb-prov"
                    className="inp"
                    value={draft.fallback.apiProvider ?? 'anthropic'}
                    onChange={(e) =>
                      set('fallback', {
                        ...draft.fallback!,
                        apiProvider: e.target.value as ApiProvider
                      })
                    }
                  >
                    {(Object.keys(API_LABELS) as ApiProvider[]).map((p) => (
                      <option key={p} value={p}>
                        {API_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label className="lbl" htmlFor="fb-model">
                    Model
                  </label>
                  <input
                    id="fb-model"
                    className="inp"
                    list="fb-model-sug"
                    value={draft.fallback.model ?? ''}
                    onChange={(e) => set('fallback', { ...draft.fallback!, model: e.target.value })}
                    placeholder="ör. claude-opus-5-5"
                  />
                  <datalist id="fb-model-sug">
                    {(MODEL_SUGGESTIONS[draft.fallback.apiProvider ?? 'anthropic'] ?? []).map(
                      (m) => (
                        <option key={m} value={m} />
                      )
                    )}
                  </datalist>
                </div>
              </div>
            ) : null}
            {draft.fallback?.mode === 'wait' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 24 }}>
                <label className="lbl" htmlFor="fb-wait">
                  Bekleme (dk)
                </label>
                <input
                  id="fb-wait"
                  type="number"
                  min={1}
                  className="inp"
                  style={{ width: 100 }}
                  value={draft.fallback.waitMinutes ?? 30}
                  onChange={(e) =>
                    set('fallback', {
                      ...draft.fallback!,
                      waitMinutes: Number(e.target.value) || 30
                    })
                  }
                />
              </div>
            ) : null}
            <span className="hint">
              Limit, CLI çıktısındaki &quot;usage limit / rate limit&quot; türü mesajlardan
              algılanır. API yedeği aynı rol ve görevle çalışır ama dosya yazamaz.
            </span>
          </section>
        ) : null}
      </main>

      <aside
        aria-label="Önizleme"
        className="scroll"
        style={{
          width: 380,
          flexShrink: 0,
          height: '100%',
          boxSizing: 'border-box',
          padding: '22px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
          background: 'var(--side)',
          borderLeft: '1px solid var(--w08)'
        }}
      >
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="h2">Çalıştırılacak komut</h2>
          <div
            className="term mono"
            style={{
              padding: 12,
              fontSize: 11.5,
              lineHeight: 1.7,
              color: 'var(--text2)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}
          >
            {preview.command}
          </div>
          {preview.notes.map((n) => (
            <span key={n} className="hint">
              • {n}
            </span>
          ))}
        </section>
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2 className="h2">Yönetici bu ajanı nasıl görüyor</h2>
          <div className="card" style={{ fontSize: 13, lineHeight: 1.5, gap: 6 }}>
            <div>
              <span className="muted">Ad:</span> {draft.name || '—'}
            </div>
            <div>
              <span className="muted">Yapabildiği:</span> {draft.title || '— (unvan yaz)'}
            </div>
            <div>
              <span className="muted">Maliyet:</span>{' '}
              {draft.engine === 'cli'
                ? 'abonelik limiti'
                : draft.engine === 'api'
                  ? 'token başına'
                  : 'ücretsiz'}
            </div>
          </div>
          <span className="hint">
            Otonom modda yönetici görevleri bu kartlara bakarak dağıtacak; unvanı net yazmak
            dağıtımı iyileştirir.
          </span>
        </section>
      </aside>
    </>
  )
}
