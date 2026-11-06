import { execFile, execFileSync } from 'child_process'

// macOS/Linux'ta Finder'dan ya da masaüstünden açılan uygulamalar kullanıcının
// kabuk PATH'ini görmez (Homebrew, npm global, ~/.local/bin vb. eksik kalır).
// Bu yüzden açılışta giriş kabuğundan PATH'i alıp kendi ortamımıza yazıyoruz.
export function loadLoginShellPath(): void {
  if (process.platform === 'win32') return
  const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
  try {
    const out = execFileSync(shell, ['-ilc', 'printf "__AG__%s__AG__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const m = out.match(/__AG__(.*)__AG__/s)
    if (m && m[1]) process.env.PATH = m[1]
  } catch {
    /* kabuk okunamazsa mevcut PATH ile devam */
  }
}

/** Bir programın tam yolunu bulur (which / where). Bulamazsa null. */
export function whichBin(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    execFile(
      isWin ? 'where' : 'which',
      [bin],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        const lines = String(stdout)
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        if (!lines.length) return resolve(null)
        if (isWin) {
          // npm global paketleri Windows'ta .cmd kabuğuyla gelir; onu tercih et
          const pick =
            lines.find((l) => /\.(cmd|exe|bat)$/i.test(l)) ??
            lines.find((l) => /\.ps1$/i.test(l) === false)
          return resolve(pick ?? null)
        }
        resolve(lines[0])
      }
    )
  })
}

/** Windows cmd.exe için bir argümanı güvenli şekilde tırnaklar. */
export function quoteWin(arg: string): string {
  if (arg === '') return '""'
  if (!/[\s"&|<>^%!()]/.test(arg)) return arg
  return '"' + arg.replace(/"/g, '""') + '"'
}

/** POSIX kabuğu için tek tırnakla tırnaklar. */
export function quotePosix(arg: string): string {
  if (arg === '') return "''"
  if (/^[A-Za-z0-9_\-./=:@,+]+$/.test(arg)) return arg
  return "'" + arg.replace(/'/g, "'\\''") + "'"
}

export function quoteArg(arg: string): string {
  return process.platform === 'win32' ? quoteWin(arg) : quotePosix(arg)
}
