import { useEffect, useState } from 'react'

const IMG = /\.(png|jpe?g|gif|webp|svg|bmp)$/i
const VIDEO = /\.(mp4|mov|webm|m4v)$/i
const AUDIO = /\.(wav|mp3|m4a|ogg|aac|flac)$/i
const TEXT =
  /\.(md|markdown|txt|json|csv|tsv|srt|vtt|log|ya?ml|html?|css|js|ts|tsx|jsx|py|sh|xml|toml|ini|env)$/i
const MAX_TEXT = 300_000

function previewKind(name: string): 'image' | 'video' | 'audio' | 'text' | 'none' {
  if (IMG.test(name)) return 'image'
  if (VIDEO.test(name)) return 'video'
  if (AUDIO.test(name)) return 'audio'
  if (TEXT.test(name) || !/\.[^/]+$/.test(name)) return 'text'
  return 'none'
}

function fileUrl(teamId: string, rel: string): string {
  return `ajfile://${teamId}/${rel.split('/').map(encodeURIComponent).join('/')}`
}

/** Uygulama içinde dosya önizleme penceresi (metin, görsel, video, ses). */
export function FilePreview({
  teamId,
  rel,
  onClose
}: {
  teamId: string
  rel: string
  onClose: () => void
}): React.JSX.Element {
  const kind = previewKind(rel)
  const url = fileUrl(teamId, rel)
  const [text, setText] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (kind !== 'text') return
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((t) => {
        if (!cancelled)
          setText(
            t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '\n\n… (dosyanın devamı kesildi)' : t
          )
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
    return () => {
      cancelled = true
    }
  }, [url, kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Önizleme: ${rel}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 32
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--w12)',
          borderRadius: 14,
          width: 'min(1100px, 100%)',
          maxHeight: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,.35)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderBottom: '1px solid var(--w08)'
          }}
        >
          <span
            className="mono"
            style={{
              fontSize: 13,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {rel}
          </span>
          <button className="btn btn-sm" onClick={() => window.api.fs.open(teamId, rel)}>
            Uygulamada aç
          </button>
          <button className="btn btn-sm" onClick={onClose} autoFocus>
            Kapat
          </button>
        </header>
        <div
          className="scroll"
          style={{
            flex: 1,
            padding: kind === 'text' ? 0 : 16,
            display: 'flex',
            justifyContent: 'center',
            background: kind === 'text' ? 'var(--term)' : undefined
          }}
        >
          {kind === 'image' ? (
            <img
              src={url}
              alt={rel}
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain' }}
            />
          ) : null}
          {kind === 'video' ? (
            <video src={url} controls autoPlay style={{ maxWidth: '100%', maxHeight: '75vh' }} />
          ) : null}
          {kind === 'audio' ? (
            <audio src={url} controls autoPlay style={{ width: '100%', margin: '24px 0' }} />
          ) : null}
          {kind === 'text' ? (
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: '14px 16px',
                fontSize: 12.5,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                width: '100%',
                color: 'var(--text2)'
              }}
            >
              {err ? `Okunamadı: ${err}` : (text ?? 'Yükleniyor…')}
            </pre>
          ) : null}
          {kind === 'none' ? (
            <div className="muted" style={{ padding: 40 }}>
              Bu dosya türü için önizleme yok. &quot;Uygulamada aç&quot; ile varsayılan programda
              açabilirsin.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
