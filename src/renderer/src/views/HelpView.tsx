import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import doc from '../../../../docs/KULLANIM.md?raw'

// Kullanım kılavuzu: docs/KULLANIM.md dosyası uygulamanın içinde gösterilir.
// Küçük bir Markdown okuyucu: başlıklar, paragraflar, listeler, tablolar,
// kod blokları, alıntılar, **kalın**, `kod` ve bağlantılar.

type Block =
  | { t: 'h'; level: number; text: string; id: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'code'; text: string }
  | { t: 'quote'; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'hr' }

function slug(s: string): string {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'))
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r/g, '').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (!l.trim()) {
      i++
      continue
    }
    if (l.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      out.push({ t: 'code', text: buf.join('\n') })
      continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      out.push({ t: 'h', level: h[1].length, text: h[2], id: slug(h[2]) })
      i++
      continue
    }
    if (/^---+$/.test(l.trim())) {
      out.push({ t: 'hr' })
      i++
      continue
    }
    if (l.startsWith('>')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push({ t: 'quote', text: buf.join(' ') })
      continue
    }
    if (l.trim().startsWith('|') && lines[i + 1]?.trim().match(/^\|?\s*:?-+/)) {
      const head = cells(l)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]))
      out.push({ t: 'table', head, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ''))
      out.push({ t: 'ul', items })
      continue
    }
    if (/^\s*\d+\.\s+/.test(l)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''))
      out.push({ t: 'ol', items })
      continue
    }
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,4}\s|```|>|\s*[-*]\s+|\s*\d+\.\s+|\|)/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      buf.push(lines[i++])
    }
    // **Kalın** satırı ile hemen altındaki açıklama ayrı satırda kalsın
    out.push({ t: 'p', text: buf.join('\n') })
  }
  return out
}

/** Satır içi biçimler: **kalın**, `kod`, [metin](adres) */
function Inline({ text }: { text: string }): React.JSX.Element {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code
              key={i}
              className="mono"
              style={{
                background: 'var(--w06)',
                borderRadius: 4,
                padding: '1px 5px',
                fontSize: '0.9em'
              }}
            >
              {p.slice(1, -1)}
            </code>
          )
        const m = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (m)
          return (
            <a key={i} href={m[2]} target="_blank" rel="noreferrer">
              {m[1]}
            </a>
          )
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}

function matches(b: Block, q: string): boolean {
  const s = (
    b.t === 'h' || b.t === 'p' || b.t === 'code' || b.t === 'quote'
      ? b.text
      : b.t === 'ul' || b.t === 'ol'
        ? b.items.join(' ')
        : b.t === 'table'
          ? [...b.head, ...b.rows.flat()].join(' ')
          : ''
  ).toLocaleLowerCase('tr')
  return s.includes(q)
}

export function HelpView(): React.JSX.Element {
  const blocks = useMemo(() => parse(doc), [])
  const toc = blocks.filter((b): b is Extract<Block, { t: 'h' }> => b.t === 'h' && b.level === 2)
  const [q, setQ] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const query = q.trim().toLocaleLowerCase('tr')

  // Aramada: eşleşen blokları, bulundukları bölümün başlığıyla birlikte göster
  const visible = useMemo(() => {
    if (!query) return blocks
    const out: Block[] = []
    let section: Block | null = null
    let sectionShown = false
    for (const b of blocks) {
      if (b.t === 'h' && b.level <= 2) {
        section = b
        sectionShown = false
        if (matches(b, query)) {
          out.push(b)
          sectionShown = true
        }
        continue
      }
      if (b.t !== 'hr' && matches(b, query)) {
        if (section && !sectionShown) {
          out.push(section)
          sectionShown = true
        }
        out.push(b)
      }
    }
    return out
  }, [blocks, query])

  // Arama değişince sonuçların başına dön
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [query])

  const go = (id: string): void => {
    setQ('')
    requestAnimationFrame(() => {
      const el = scroller.current?.querySelector(`#${CSS.escape(id)}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <>
      <nav
        aria-label="Kılavuz içindekiler"
        className="scroll"
        style={{
          width: 250,
          flexShrink: 0,
          height: '100%',
          boxSizing: 'border-box',
          padding: '22px 14px',
          borderRight: '1px solid var(--w08)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}
      >
        <label htmlFor="help-search" className="sr">
          Kılavuzda ara
        </label>
        <input
          id="help-search"
          className="inp"
          placeholder="Kılavuzda ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div className="section-title" style={{ padding: '0 6px 4px' }}>
          İçindekiler
        </div>
        {toc.map((h) => (
          <button
            key={h.id}
            className="nav"
            style={{ fontSize: 13, padding: '6px 8px' }}
            onClick={() => go(h.id)}
          >
            {h.text}
          </button>
        ))}
      </nav>
      <main
        ref={scroller}
        className="scroll"
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          boxSizing: 'border-box',
          padding: '28px 40px 60px'
        }}
      >
        <article className="doc" style={{ maxWidth: 860, margin: '0 auto' }}>
          {query && visible.length === 0 ? (
            <p className="muted">&quot;{q}&quot; için sonuç yok.</p>
          ) : null}
          {visible.map((b, i) => {
            switch (b.t) {
              case 'h': {
                const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4'
                return (
                  <Tag key={i} id={b.id}>
                    <Inline text={b.text} />
                  </Tag>
                )
              }
              case 'p':
                return (
                  <p key={i}>
                    {b.text.split('\n').map((line, j) => (
                      <Fragment key={j}>
                        {j ? <br /> : null}
                        <Inline text={line} />
                      </Fragment>
                    ))}
                  </p>
                )
              case 'ul':
                return (
                  <ul key={i}>
                    {b.items.map((it, j) => (
                      <li key={j}>
                        <Inline text={it} />
                      </li>
                    ))}
                  </ul>
                )
              case 'ol':
                return (
                  <ol key={i}>
                    {b.items.map((it, j) => (
                      <li key={j}>
                        <Inline text={it} />
                      </li>
                    ))}
                  </ol>
                )
              case 'code':
                return (
                  <pre key={i} className="mono">
                    {b.text}
                  </pre>
                )
              case 'quote':
                return (
                  <blockquote key={i}>
                    <Inline text={b.text} />
                  </blockquote>
                )
              case 'table':
                return (
                  <div key={i} style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          {b.head.map((h, j) => (
                            <th key={j}>
                              <Inline text={h} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {b.rows.map((r, j) => (
                          <tr key={j}>
                            {r.map((c, k) => (
                              <td key={k}>
                                <Inline text={c} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              case 'hr':
                return <hr key={i} />
            }
          })}
        </article>
      </main>
    </>
  )
}
