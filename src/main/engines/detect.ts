import { exec, execFile } from 'child_process'
import type { CliDetection } from '../../shared/types'
import { quoteWin, whichBin } from '../shellEnv'

const KNOWN: Array<Omit<CliDetection, 'path' | 'version'>> = [
  {
    id: 'claude',
    label: 'Claude Code',
    bin: 'claude',
    installHint: 'npm install -g @anthropic-ai/claude-code  →  ardından: claude (giriş yap)'
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    bin: 'codex',
    installHint: 'npm install -g @openai/codex  →  ardından: codex login'
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    bin: 'agy',
    installHint:
      'curl -fsSL https://antigravity.google/cli/install.sh | bash  →  ardından: agy (giriş yap)'
  },
  {
    id: 'gemini',
    label: 'Gemini CLI (eski)',
    bin: 'gemini',
    installHint:
      "Bireysel hesaplar için 18 Haziran 2026'da kapatıldı; yerine Antigravity CLI kullan."
  },
  {
    id: 'grok',
    label: 'Grok CLI',
    bin: 'grok',
    installHint:
      'Kurulu bir Grok CLI varsa "Özel CLI" ajanı olarak komut şablonuyla kullanılabilir.'
  }
]

function versionOf(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (err: Error | null, stdout: string | Buffer): void => {
      if (err) return resolve(null)
      const line = String(stdout)
        .split(/\r?\n/)
        .find((l) => l.trim())
      resolve(line ? line.trim().slice(0, 80) : null)
    }
    if (process.platform === 'win32') {
      exec(`${quoteWin(path)} --version`, { timeout: 8000, windowsHide: true }, done).stdin?.end()
    } else {
      // stdin hemen kapatılır: girdi bekleyen bir program sürüm sorgusunda takılmasın
      execFile(path, ['--version'], { timeout: 8000 }, done).stdin?.end()
    }
  })
}

let cached: CliDetection[] | null = null

export async function detectClis(force = false): Promise<CliDetection[]> {
  if (cached && !force) return cached
  cached = await Promise.all(
    KNOWN.map(async (k) => {
      const path = await whichBin(k.bin)
      const version = path ? await versionOf(path) : null
      return { ...k, path, version }
    })
  )
  return cached
}

export async function resolveCliPath(bin: string): Promise<string | null> {
  const list = await detectClis()
  const hit = list.find((c) => c.bin === bin)
  if (hit?.path) return hit.path
  // Kullanıcı uygulama açıkken kurmuş olabilir: bir kez daha dene
  return whichBin(bin)
}
