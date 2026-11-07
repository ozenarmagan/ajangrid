import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cleanError } from '../util'
import { Paperclip, Send, Stop, X } from './Icons'

export interface Attachment {
  path: string
  name: string
  /** Görsellerde küçük önizleme */
  thumb?: string
}

const IMG = /\.(png|jpe?g|gif|webp|bmp|heic|svg)$/i

interface Props {
  placeholder: string
  /** Yönetici çalışıyor: gönderim kapalı, Durdur düğmesi görünür */
  busy?: boolean
  onStop?: () => void
  sendLabel?: string
  /** true dönerse kutu temizlenir */
  onSend: (text: string, files: string[]) => Promise<boolean>
  onError: (msg: string) => void
  /** Alt satırın solunda gösterilecek ek denetimler */
  footer?: ReactNode
  /** Dışarıdan metin eklemek için (ör. zamanlama formu metni okur) */
  onTextChange?: (t: string) => void
  autoFocus?: boolean
}

let pasteNo = 0

/**
 * Yöneticiye mesaj kutusu. Enter gönderir, Shift+Enter yeni satır.
 * Dosya eklemek için ataç düğmesi, sürükle-bırak ya da yapıştırma (görseller dahil).
 */
export function Composer({
  placeholder,
  busy,
  onStop,
  sendLabel = 'Gönder',
  onSend,
  onError,
  footer,
  onTextChange,
  autoFocus
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Attachment[]>([])
  const [drag, setDrag] = useState(false)
  const [sending, setSending] = useState(false)
  const ta = useRef<HTMLTextAreaElement>(null)

  // Metin büyüdükçe kutu da büyüsün (en fazla ~10 satır)
  useEffect(() => {
    const el = ta.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [text])

  useEffect(() => {
    if (autoFocus) ta.current?.focus()
  }, [autoFocus])

  const changeText = (t: string): void => {
    setText(t)
    onTextChange?.(t)
  }

  const addPaths = (paths: string[]): void => {
    const add = paths
      .filter(Boolean)
      .filter((p) => !files.some((f) => f.path === p))
      .map((p) => ({ path: p, name: p.split(/[\\/]/).pop() ?? p }))
    if (add.length) setFiles((prev) => [...prev, ...add])
  }

  /** Tarayıcı File nesnelerini diskteki yollara çevirir (yolu yoksa geçici dosyaya yazar). */
  const addFiles = async (list: File[]): Promise<void> => {
    const out: Attachment[] = []
    for (const f of list) {
      try {
        let path = window.api.fs.pathForFile(f)
        const isImg = f.type.startsWith('image/') || IMG.test(f.name)
        let name = f.name
        if (!path) {
          // Panodan yapıştırılan görsel: diske yaz
          const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
          name = f.name && f.name !== 'image.png' ? f.name : `yapistirilan-${++pasteNo}.${ext}`
          path = await window.api.fs.saveTemp(name, await f.arrayBuffer())
        }
        out.push({ path, name, thumb: isImg ? URL.createObjectURL(f) : undefined })
      } catch (e) {
        onError(cleanError(e))
      }
    }
    if (out.length)
      setFiles((prev) => [...prev, ...out.filter((o) => !prev.some((p) => p.path === o.path))])
  }

  const remove = (path: string): void => {
    setFiles((prev) => {
      const f = prev.find((x) => x.path === path)
      if (f?.thumb) URL.revokeObjectURL(f.thumb)
      return prev.filter((x) => x.path !== path)
    })
  }

  const pick = async (): Promise<void> => {
    try {
      addPaths(await window.api.dialog.pickFiles())
    } catch (e) {
      onError(cleanError(e))
    }
  }

  const canSend = !busy && !sending && (text.trim().length > 0 || files.length > 0)

  const send = async (): Promise<void> => {
    if (!canSend) return
    setSending(true)
    try {
      const ok = await onSend(
        text.trim(),
        files.map((f) => f.path)
      )
      if (ok) {
        files.forEach((f) => f.thumb && URL.revokeObjectURL(f.thumb))
        setFiles([])
        changeText('')
      }
    } finally {
      setSending(false)
      ta.current?.focus()
    }
  }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    setDrag(false)
    const dropped = [...e.dataTransfer.files]
    if (dropped.length) return addFiles(dropped)
    const link = (
      e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    ).trim()
    if (link) {
      const lines = link
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith('#'))
        .join('\n')
      changeText(text.trim() ? `${text.trim()}\n${lines}` : lines)
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
      style={{
        border: drag ? '1px dashed #8b5cf6' : '1px solid var(--w12)',
        borderRadius: 14,
        background: 'var(--panel)',
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      {files.length ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {files.map((f) => (
            <span
              key={f.path}
              className="chip on"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingRight: 4 }}
              title={f.path}
            >
              {f.thumb ? (
                <img
                  src={f.thumb}
                  alt=""
                  style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }}
                />
              ) : null}
              <span
                style={{
                  maxWidth: 180,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {f.name}
              </span>
              <button
                className="ib"
                style={{ width: 20, height: 20 }}
                aria-label={`${f.name} ekini kaldır`}
                onClick={() => remove(f.path)}
              >
                <X />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <label htmlFor="composer" className="sr">
        Yöneticiye mesaj
      </label>
      <textarea
        id="composer"
        ref={ta}
        rows={2}
        className="composer"
        value={text}
        onChange={(e) => changeText(e.target.value)}
        onPaste={(e) => {
          const pasted = [...e.clipboardData.files]
          if (pasted.length) {
            e.preventDefault()
            void addFiles(pasted)
          }
        }}
        onKeyDown={(e) => {
          // Enter gönderir; Shift+Enter yeni satır. Türkçe/Asya IME bileşimi sürerken gönderme.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            void send()
          }
        }}
        placeholder={placeholder}
        style={{ resize: 'none', overflowY: 'auto' }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <button
            className="ib"
            style={{ width: 32, height: 32, border: '1px solid var(--w12)' }}
            aria-label="Dosya ekle"
            title="Dosya ya da görsel ekle (sürükleyip bırakabilir, görsel yapıştırabilirsin)"
            onClick={pick}
          >
            <Paperclip />
          </button>
          {footer}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="hint">Enter gönderir · Shift+Enter yeni satır</span>
          {busy && onStop ? (
            <button className="btn btn-danger" onClick={onStop}>
              <Stop size={12} /> Durdur
            </button>
          ) : (
            <button className="btn btn-p" onClick={send} disabled={!canSend}>
              <Send size={14} /> {sendLabel}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
