// Ana süreç ile arayüz arasında paylaşılan tipler.

export type EngineKind = 'cli' | 'api' | 'local'
export type CliId = 'claude' | 'codex' | 'gemini' | 'custom'
export type ApiProvider = 'anthropic' | 'openai' | 'google' | 'openrouter'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Theme = 'dark' | 'light'

export interface AgentPermissions {
  /** Çalışma klasörüne dosya yazabilir */
  write: boolean
  /** Terminal komutu çalıştırabilir */
  shell: boolean
  /** İnternete erişebilir (destekleyen CLI'larda) */
  network: boolean
}

export interface Agent {
  id: string
  teamId: string
  name: string
  /** Yöneticinin göreceği kısa görev unvanı */
  title: string
  /** Rol ve talimatlar (sistem talimatı) */
  role: string
  isManager: boolean
  color: string
  engine: EngineKind
  /** engine = 'cli' */
  cli?: CliId
  /** cli = 'custom' — komut şablonu, ör: grok -m {model}. Görev stdin'den verilir. */
  customCommand?: string
  /** engine = 'api' */
  apiProvider?: ApiProvider
  /** engine = 'local' */
  localToolId?: string
  /** Boş bırakılırsa CLI'ın varsayılan modeli kullanılır */
  model: string
  effort: Effort
  /** Boşsa ekibin çalışma klasörü kullanılır */
  workdir?: string
  permissions: AgentPermissions
  createdAt: number
}

export interface Team {
  id: string
  name: string
  workdir: string
}

export interface LocalTool {
  id: string
  name: string
  /**
   * Kabuk komutu şablonu. Yer tutucular:
   * {prompt} görev metni (tırnaklanmış), {prompt_file} görev metninin yazıldığı dosya,
   * {workdir} çalışma klasörü, {out_dir} çıktı klasörü (workdir/outputs)
   */
  template: string
  note?: string
}

export interface Settings {
  theme: Theme
  activeTeamId: string | null
}

export interface AppData {
  version: 1
  teams: Team[]
  agents: Agent[]
  localTools: LocalTool[]
  settings: Settings
}

export type RunStatus = 'running' | 'done' | 'error' | 'stopped'

export interface RunInfo {
  id: string
  agentId: string
  teamId: string
  prompt: string
  status: RunStatus
  /** Kullanıcıya gösterilen komut satırı (gizli bilgi içermez) */
  commandLine: string
  workdir: string
  startedAt: number
  endedAt?: number
  exitCode?: number | null
  /** Hata durumunda kısa açıklama */
  error?: string
  /** API ajanlarında yanıtın kaydedildiği dosya */
  outputFile?: string
}

export interface RunDataEvent {
  runId: string
  agentId: string
  chunk: string
  stream: 'stdout' | 'stderr' | 'system'
}

export interface CliDetection {
  id: Exclude<CliId, 'custom'> | 'grok'
  label: string
  bin: string
  path: string | null
  version: string | null
  installHint: string
}

export interface ApiKeyStatus {
  provider: ApiProvider
  label: string
  hasKey: boolean
  /** Anahtarın son 4 karakteri */
  hint: string | null
  encryptionAvailable: boolean
}

export interface WorkdirEntry {
  name: string
  relPath: string
  isDir: boolean
  size: number
  mtime: number
}

export const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek',
  xhigh: 'Çok yüksek',
  max: 'Maks'
}

export const CLI_LABELS: Record<CliId, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
  custom: 'Özel CLI'
}

export const API_LABELS: Record<ApiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter'
}
