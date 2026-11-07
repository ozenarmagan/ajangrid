import { execFile } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// Çalışma klasörünün anlık görüntüleri. Kullanıcının kendi git deposuna dokunmamak için
// ayrı bir "gölge" depo kullanılır: <klasör>/.ajangrid/snap.git
// Ajanlar bir şeyi bozarsa klasör, herhangi bir adımdan önceki haline döndürülebilir.

const EXCLUDE = [
  '.ajangrid/',
  '.git/',
  'node_modules/',
  '.venv/',
  '__pycache__/',
  '.DS_Store'
].join('\n')

function git(workdir: string, args: string[]): Promise<string> {
  const gitDir = join(workdir, '.ajangrid', 'snap.git')
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      [
        `--git-dir=${gitDir}`,
        `--work-tree=${workdir}`,
        '-c',
        'user.name=AjanGrid',
        '-c',
        'user.email=ajangrid@localhost',
        '-c',
        'core.autocrlf=false',
        ...args
      ],
      { cwd: workdir, maxBuffer: 16 * 1024 * 1024, timeout: 120_000, windowsHide: true },
      (err, stdout, stderr) =>
        err
          ? reject(new Error(String(stderr || err.message).trim()))
          : resolve(String(stdout).trim())
    ).stdin?.end()
  })
}

async function ensureRepo(workdir: string): Promise<void> {
  const gitDir = join(workdir, '.ajangrid', 'snap.git')
  if (existsSync(join(gitDir, 'HEAD'))) return
  mkdirSync(join(workdir, '.ajangrid'), { recursive: true })
  await git(workdir, ['init', '-q'])
  mkdirSync(join(gitDir, 'info'), { recursive: true })
  writeFileSync(join(gitDir, 'info', 'exclude'), EXCLUDE + '\n', 'utf8')
}

/** Klasörün o anki halini kaydeder; commit kimliğini döner. git yoksa null. */
export async function snapshot(workdir: string, message: string): Promise<string | null> {
  try {
    await ensureRepo(workdir)
    await git(workdir, ['add', '-A'])
    await git(workdir, [
      'commit',
      '-q',
      '--allow-empty',
      '--no-verify',
      '-m',
      message.slice(0, 200)
    ])
    return await git(workdir, ['rev-parse', 'HEAD'])
  } catch (err) {
    console.error('[snapshot]', err)
    return null
  }
}

/**
 * Klasörü verilen anlık görüntüye döndürür. Önce mevcut hali de kaydeder,
 * böylece geri alma işlemi de geri alınabilir. Kaydedilen o yedeğin kimliğini döner.
 */
export async function restore(workdir: string, hash: string): Promise<string | null> {
  if (!/^[0-9a-f]{7,40}$/i.test(hash)) throw new Error('Geçersiz anlık görüntü.')
  const before = await snapshot(workdir, 'Geri almadan önceki hal')
  await git(workdir, ['reset', '-q', '--hard', hash])
  // Anlık görüntüden sonra oluşturulan dosyaları da kaldır (hariç tutulanlara dokunmaz)
  await git(workdir, ['clean', '-fdq'])
  return before
}
