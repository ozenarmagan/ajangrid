import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import type { Theme } from '../../../shared/types'
import { useStore } from '../store'
import { timeOf } from '../util'

const THEMES: Record<Theme, Terminal['options']['theme']> = {
  dark: {
    background: '#050506',
    foreground: '#d4d4d8',
    cursor: '#050506',
    selectionBackground: 'rgba(167,139,250,.35)',
    green: '#6ee7b7',
    yellow: '#fcd34d',
    red: '#fca5a5',
    magenta: '#c4b5fd',
    blue: '#93c5fd',
    cyan: '#67e8f9',
    brightBlack: '#71717a'
  },
  light: {
    background: '#fafafa',
    foreground: '#27272a',
    cursor: '#fafafa',
    selectionBackground: 'rgba(124,58,237,.25)',
    green: '#047857',
    yellow: '#b45309',
    red: '#b91c1c',
    magenta: '#6d28d9',
    blue: '#1d4ed8',
    cyan: '#0e7490',
    brightBlack: '#71717a',
    white: '#3f3f46',
    brightWhite: '#18181b'
  }
}

const DIM = '\x1b[90m'
const VIOLET = '\x1b[35m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

/** Bir ajanın tüm çalışmalarının çıktısını salt-okunur bir terminalde gösterir. */
export function AgentTerminal({
  agentId,
  theme,
  fontSize = 12
}: {
  agentId: string
  theme: Theme
  fontSize?: number
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const { runs, outputOf, subscribeChunks } = useStore()
  const seen = useRef(new Set<string>())
  const runsRef = useRef(runs)
  useEffect(() => {
    runsRef.current = runs
  }, [runs])

  const header = (prompt: string, startedAt: number): string => {
    // Yönetici turlarında istem çok uzun; başlıkta yalnızca etiket göster
    if (prompt.includes('ekibinin yöneticisisin'))
      return `${VIOLET}── ${timeOf(startedAt)} · yönetici turu${RESET}\r\n`
    const first = prompt.split(/\r?\n/)[0].slice(0, 90)
    return `${VIOLET}── ${timeOf(startedAt)} · ${first}${prompt.length > 90 ? '…' : ''}${RESET}\r\n`
  }

  useEffect(() => {
    if (!host.current) return
    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      cursorBlink: false,
      cursorInactiveStyle: 'none',
      fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
      fontSize,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: THEMES[theme]
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current)
    termRef.current = term
    seen.current = new Set()

    for (const r of runsRef.current.filter((x) => x.agentId === agentId)) {
      seen.current.add(r.id)
      term.write(header(r.prompt, r.startedAt))
      term.write(outputOf(r.id))
      term.write('\r\n')
    }
    if (!seen.current.size)
      term.write(`${DIM}Henüz çalışma yok. Bu ajana Komuta Merkezi'nden görev ver.${RESET}\r\n`)

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* görünmezken ölçülemez */
      }
    })
    ro.observe(host.current)

    const off = subscribeChunks((e) => {
      if (e.agentId !== agentId) return
      if (!seen.current.has(e.runId)) {
        seen.current.add(e.runId)
        const r = runsRef.current.find((x) => x.id === e.runId)
        term.write(header(r?.prompt ?? 'yeni görev', r?.startedAt ?? Date.now()))
      }
      term.write(
        e.stream === 'system' && e.chunk.includes('[hata]')
          ? RED + e.chunk + RESET
          : e.stream === 'system'
            ? DIM + e.chunk + RESET
            : e.chunk
      )
    })
    return () => {
      off()
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId])

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = THEMES[theme]
  }, [theme])

  return (
    <div
      ref={host}
      style={{ width: '100%', height: '100%', padding: '8px 10px', boxSizing: 'border-box' }}
    />
  )
}
