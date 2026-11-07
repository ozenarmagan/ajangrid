import { cpSync, existsSync, mkdirSync } from 'fs'
import { basename, extname, join } from 'path'

/** Dosyaları klasörün kaynak/ altına kopyalar; göreli yolları döner. */
export function copyInto(workdir: string, paths: string[] = []): string[] {
  const dir = join(workdir, 'kaynak')
  const out: string[] = []
  for (const p of paths) {
    if (!p || !existsSync(p)) continue
    mkdirSync(dir, { recursive: true })
    const ext = extname(p)
    const stem = basename(p, ext)
    let name = basename(p)
    for (let i = 2; existsSync(join(dir, name)); i++) name = `${stem}-${i}${ext}`
    cpSync(p, join(dir, name), { recursive: true })
    out.push(`kaynak/${name}`)
  }
  return out
}

export function slugify(s: string, max = 40): string {
  return (
    s
      .toLocaleLowerCase('tr')
      .replace(/ı/g, 'i')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, max)
      .replace(/-$/, '') || 'hedef'
  )
}

/** Kök altında benzersiz, yeni bir hedef klasörü açar: 2026-11-07-blog-videosu */
export function newGoalDir(root: string, goal: string): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${slugify(goal.split('\n')[0])}`
  let dir = join(root, base)
  for (let i = 2; existsSync(dir); i++) dir = join(root, `${base}-${i}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function attachNote(rel: string[]): string {
  return rel.length ? `\n\n[Eklenen dosyalar: ${rel.join(', ')}]` : ''
}
