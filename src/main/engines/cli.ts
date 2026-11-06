import type { Agent, Effort } from '../../shared/types'

// Her CLI için "headless" (etkileşimsiz) çalıştırma planı.
// Görev metni her zaman stdin'den verilir: uzun ve özel karakterli metinler
// komut satırı tırnaklama sorunlarına (özellikle Windows cmd.exe) takılmaz.

export interface CliPlan {
  /** Çalıştırılacak program (bin adı); custom'da null, komut kabukta çalışır */
  bin: string | null
  args: string[]
  /** custom CLI için kabuk komutu */
  shellCommand?: string
  stdin: string
  /** Rol metninin dosyaya yazılması gerekiyorsa içeriği (claude) */
  roleFileContent?: string
  /** Arayüzde gösterilecek açıklamalar */
  notes: string[]
}

const ROLE_FILE_PLACEHOLDER = '{rol_dosyasi}'

function withRole(agent: Agent, task: string): string {
  const role = agent.role.trim()
  if (!role) return task
  return `# Rolün ve talimatların\n${role}\n\n# Görev\n${task}`
}

function codexEffort(e: Effort): string {
  // Codex'te kademeler modele göre değişir; güvenli eşleme
  if (e === 'low') return 'low'
  if (e === 'medium') return 'medium'
  return 'high'
}

export function buildCliPlan(agent: Agent, task: string, workdir: string): CliPlan {
  const model = agent.model.trim()
  const p = agent.permissions
  const notes: string[] = []

  switch (agent.cli) {
    case 'claude': {
      const args = ['-p', '--output-format', 'text']
      if (agent.role.trim()) args.push('--append-system-prompt-file', ROLE_FILE_PLACEHOLDER)
      if (model) args.push('--model', model)
      args.push('--effort', agent.effort)
      const mode = p.write && p.shell ? 'bypassPermissions' : p.write ? 'acceptEdits' : 'default'
      args.push('--permission-mode', mode)
      if (!p.network) args.push('--disallowedTools', 'WebFetch', 'WebSearch')
      if (mode === 'default')
        notes.push('Yazma izni yok: ajan dosya değiştiremez, yalnızca yanıt üretir.')
      return {
        bin: 'claude',
        args,
        stdin: task,
        roleFileContent: agent.role.trim() || undefined,
        notes
      }
    }
    case 'codex': {
      const args = ['exec', '--skip-git-repo-check', '-C', workdir]
      if (model) args.push('-m', model)
      args.push('-c', `model_reasoning_effort=${codexEffort(agent.effort)}`)
      if (p.write || p.shell) {
        args.push('--full-auto')
        if (p.network) args.push('-c', 'sandbox_workspace_write.network_access=true')
      } else {
        args.push('-s', 'read-only')
      }
      args.push('-')
      if (agent.effort === 'xhigh' || agent.effort === 'max') {
        notes.push('Codex için efor "high" olarak gönderilir.')
      }
      return { bin: 'codex', args, stdin: withRole(agent, task), notes }
    }
    case 'gemini': {
      const args: string[] = []
      if (model) args.push('-m', model)
      if (p.write || p.shell) args.push('--yolo')
      args.push('-p', 'Aşağıdaki talimatları uygula.')
      notes.push('Gemini CLI efor seviyesi desteklemez; bu ayar yok sayılır.')
      return { bin: 'gemini', args, stdin: withRole(agent, task), notes }
    }
    case 'custom':
    default: {
      const tpl = (agent.customCommand || '').trim()
      const cmd = tpl
        .replaceAll('{model}', model)
        .replaceAll('{effort}', agent.effort)
        .replaceAll('{workdir}', workdir)
      notes.push('Görev ve rol metni programa stdin üzerinden verilir.')
      return { bin: null, args: [], shellCommand: cmd, stdin: withRole(agent, task), notes }
    }
  }
}

export { ROLE_FILE_PLACEHOLDER }
