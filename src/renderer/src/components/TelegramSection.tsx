import { useEffect, useState } from 'react'
import type { TelegramStatus } from '../../../shared/types'
import { useStore } from '../store'
import { cleanError } from '../util'

/** Motorlar ekranı: masaüstü bildirimleri ve Telegram botu. */
export function TelegramSection(): React.JSX.Element {
  const { data } = useStore()
  const [st, setSt] = useState<TelegramStatus | null>(null)
  const [token, setToken] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    window.api.telegram.status().then(setSt)
    return window.api.telegram.onStatus(setSt)
  }, [])

  const run = async (fn: () => Promise<TelegramStatus | void>, ok?: string): Promise<void> => {
    setBusy(true)
    setErr(null)
    setInfo(null)
    try {
      const r = await fn()
      if (r) setSt(r)
      if (ok) setInfo(ok)
    } catch (e) {
      setErr(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const notifOn = data?.settings.notifications !== false

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Bildirimler ve Telegram</h2>
      <label className="chk">
        <input
          type="checkbox"
          checked={notifOn}
          onChange={(e) => window.api.settings.set({ notifications: e.target.checked })}
        />
        Masaüstü bildirimi: onay beklerken, iş bitince ya da hata olunca
      </label>

      <div className="card" style={{ gap: 10, maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Telegram botu</span>
          {st?.paired ? (
            <span className="badge b-loc">eşleşti: {st.chatName}</span>
          ) : st?.hasToken ? (
            <span className="badge b-amber">eşleşmedi</span>
          ) : (
            <span className="badge b-neutral">kurulmadı</span>
          )}
          {st?.botName ? <span className="hint">@{st.botName}</span> : null}
        </div>
        <div className="hint" style={{ lineHeight: 1.55 }}>
          Yönetici onay beklediğinde telefonuna mesaj gelir: düğmeyle onaylarsın, düzeltme için
          yazarsın. <span className="mono">/hedef metin</span> ile aktif ekibe yeni hedef,{' '}
          <span className="mono">/durum</span> ile süren işleri görürsün. Mesajlar yalnızca uygulama
          açıkken gelir.
        </div>

        {!st?.hasToken ? (
          <>
            <ol className="hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>
                Telegram&apos;da <span className="mono">@BotFather</span>&apos;a{' '}
                <span className="mono">/newbot</span> yaz, bota bir ad ver.
              </li>
              <li>Verdiği anahtarı (123456:ABC… biçiminde) aşağıya yapıştır.</li>
            </ol>
            <div style={{ display: 'flex', gap: 6 }}>
              <label htmlFor="tg-token" className="sr">
                Telegram bot anahtarı
              </label>
              <input
                id="tg-token"
                type="password"
                className="inp"
                placeholder="Bot anahtarı"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                className="btn btn-p"
                disabled={!token.trim() || busy}
                onClick={() =>
                  run(
                    () => window.api.telegram.setToken(token),
                    'Anahtar doğrulandı ve kaydedildi.'
                  ).then(() => setToken(''))
                }
              >
                Kaydet
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {!st.paired ? (
              <button
                className="btn btn-p"
                disabled={busy}
                onClick={() => run(() => window.api.telegram.pair())}
              >
                Eşleştir
              </button>
            ) : (
              <>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => run(() => window.api.telegram.test(), 'Test mesajı gönderildi.')}
                >
                  Test mesajı gönder
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => run(() => window.api.telegram.unpair())}
                >
                  Eşleşmeyi kaldır
                </button>
              </>
            )}
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() => run(() => window.api.telegram.removeToken())}
            >
              Botu kaldır
            </button>
          </div>
        )}

        {st?.pairCode ? (
          <div
            style={{
              background: 'rgba(251,191,36,.08)',
              border: '1px solid rgba(251,191,36,.4)',
              borderRadius: 10,
              padding: '10px 12px'
            }}
          >
            Telegram&apos;da botuna şunu gönder:{' '}
            <span className="mono" style={{ fontWeight: 600, fontSize: 15 }}>
              /start {st.pairCode}
            </span>
            <div className="hint">Kod 10 dakika geçerli. Eşleşince bu kutu kapanır.</div>
          </div>
        ) : null}
        {info ? (
          <span className="hint" style={{ color: 'var(--green-fg)' }}>
            {info}
          </span>
        ) : null}
        {err || st?.error ? (
          <span className="hint" style={{ color: 'var(--red-fg)' }}>
            {err ?? st?.error}
          </span>
        ) : null}
      </div>
    </section>
  )
}
