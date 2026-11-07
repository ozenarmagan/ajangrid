// Ana süreç ile arayüz arasında paylaşılan tipler.

export type EngineKind = 'cli' | 'api' | 'local'
export type CliId = 'claude' | 'codex' | 'antigravity' | 'gemini' | 'custom'
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
  /** Abonelik limiti dolunca ne yapılacağı (CLI ajanları) */
  fallback?: AgentFallback
  createdAt: number
}

export type FallbackMode = 'none' | 'api' | 'wait' | 'ask'

export interface AgentFallback {
  mode: FallbackMode
  apiProvider?: ApiProvider
  model?: string
  /** mode = 'wait' — kaç dakika sonra tekrar denensin */
  waitMinutes?: number
}

export interface Team {
  id: string
  name: string
  workdir: string
  /** Yönetici bu ajanlara görev vermeden önce kullanıcı onayı istenir */
  checkpoints?: string[]
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

export interface ApiPrice {
  /** USD / 1M girdi token */
  input: number
  /** USD / 1M çıktı token */
  output: number
}

export interface Settings {
  theme: Theme
  activeTeamId: string | null
  /** Sağlayıcı başına fiyat (0 = bilinmiyor, maliyet hesaplanmaz) */
  apiPricing?: Partial<Record<ApiProvider, ApiPrice>>
  /** Sağlayıcı başına günlük harcama tavanı, USD (0 = sınırsız) */
  apiDailyCapUsd?: Partial<Record<ApiProvider, number>>
  /** Yönetici döngüsünde en fazla adım */
  maxOrchestrationSteps?: number
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
  /** Bu çalışma bir yönetici döngüsüne aitse */
  orchId?: string
  /** Abonelik limiti dolduğu algılandı */
  limitHit?: boolean
  /** Limit nedeniyle bu çalışmanın yerine başlatılan çalışma */
  replacedBy?: string
  /** Bu çalışma başka bir çalışmanın yedeği ise açıklama */
  via?: string
  usage?: { input: number; output: number; costUsd?: number }
}

// ---------- Yönetici döngüsü ----------

export type OrchStatus = 'running' | 'waiting' | 'done' | 'error' | 'stopped'

export interface Assignment {
  agentId: string
  task: string
}

export interface OrchStep {
  id: string
  kind: 'manager' | 'task' | 'user' | 'note'
  at: number
  agentId?: string
  task?: string
  runId?: string
  status?: RunStatus
  /** Görev çıktısının özeti / yöneticinin değerlendirmesi / kullanıcı yanıtı */
  text?: string
}

/** Yöneticinin önerdiği yeni ajan (kullanıcı onayından sonra oluşturulur) */
export interface AgentProposal {
  name: string
  title: string
  role: string
  engine: EngineKind
  cli?: CliId
  apiProvider?: ApiProvider
  localToolId?: string
  model: string
  effort: Effort
  permissions: AgentPermissions
  /** Uyarılar (ör. CLI kurulu değil) */
  warnings?: string[]
}

export interface OrchQuestion {
  id: string
  kind: 'approval' | 'question' | 'limit' | 'team'
  text: string
  /** approval: onaylanırsa çalıştırılacak görevler */
  pending?: Assignment[]
  /** team: onaylanırsa oluşturulacak ajanlar */
  proposals?: AgentProposal[]
}

export interface Orchestration {
  id: string
  teamId: string
  managerId: string
  goal: string
  status: OrchStatus
  steps: OrchStep[]
  question?: OrchQuestion
  summary?: string
  checkpoints: string[]
  startedAt: number
  endedAt?: number
  error?: string
}

export interface OrchAnswer {
  approve?: boolean
  text?: string
}

// ---------- Kullanım ----------

export interface UsageSummary {
  cli: Array<{ cli: CliId; runs5h: number; runsToday: number; lastLimitAt: number | null }>
  api: Array<{
    provider: ApiProvider
    inputToday: number
    outputToday: number
    costToday: number
    costMonth: number
    capUsd: number
  }>
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
  antigravity: 'Antigravity CLI',
  gemini: 'Gemini CLI (eski)',
  custom: 'Özel CLI'
}

export const API_LABELS: Record<ApiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  openrouter: 'OpenRouter'
}
