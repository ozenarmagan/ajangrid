import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import type {
  Agent,
  ApiKeyStatus,
  ApiProvider,
  AppData,
  CliDetection,
  LocalTool,
  OrchAnswer,
  Orchestration,
  UsageSummary,
  RunDataEvent,
  RunInfo,
  Settings,
  StartGoalOptions,
  TelegramStatus,
  WorkdirEntry
} from '../shared/types'

type Unsubscribe = () => void

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  data: {
    load: (): Promise<AppData> => ipcRenderer.invoke('data:load'),
    onChanged: (cb: (d: AppData) => void): Unsubscribe => on('data:changed', cb)
  },
  agents: {
    save: (a: Agent): Promise<Agent> => ipcRenderer.invoke('agents:save', a),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('agents:delete', id),
    exportAll: (): Promise<string | null> => ipcRenderer.invoke('agents:export'),
    importPack: (): Promise<{ added: string[]; warnings: string[] } | null> =>
      ipcRenderer.invoke('agents:import')
  },
  tools: {
    save: (t: LocalTool): Promise<LocalTool> => ipcRenderer.invoke('tools:save', t),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('tools:delete', id)
  },
  settings: {
    set: (patch: Partial<Settings>): Promise<void> => ipcRenderer.invoke('settings:set', patch)
  },
  clis: {
    detect: (force?: boolean): Promise<CliDetection[]> => ipcRenderer.invoke('clis:detect', force)
  },
  keys: {
    list: (): Promise<ApiKeyStatus[]> => ipcRenderer.invoke('keys:list'),
    set: (p: ApiProvider, key: string): Promise<ApiKeyStatus[]> =>
      ipcRenderer.invoke('keys:set', p, key),
    remove: (p: ApiProvider): Promise<ApiKeyStatus[]> => ipcRenderer.invoke('keys:remove', p)
  },
  runs: {
    start: (agentId: string, prompt: string): Promise<RunInfo> =>
      ipcRenderer.invoke('runs:start', agentId, prompt),
    stop: (runId: string): Promise<void> => ipcRenderer.invoke('runs:stop', runId),
    stopAll: (): Promise<void> => ipcRenderer.invoke('runs:stopAll'),
    list: (): Promise<RunInfo[]> => ipcRenderer.invoke('runs:list'),
    output: (runId: string): Promise<string> => ipcRenderer.invoke('runs:output', runId),
    clear: (agentId?: string): Promise<void> => ipcRenderer.invoke('runs:clear', agentId),
    preview: (a: Agent): Promise<{ command: string; notes: string[] }> =>
      ipcRenderer.invoke('runs:preview', a),
    onData: (cb: (e: RunDataEvent) => void): Unsubscribe => on('run:data', cb),
    onUpdate: (cb: (r: RunInfo) => void): Unsubscribe => on('run:update', cb)
  },
  orch: {
    list: (): Promise<Orchestration[]> => ipcRenderer.invoke('orch:list'),
    start: (goal: string, opts?: StartGoalOptions): Promise<Orchestration> =>
      ipcRenderer.invoke('orch:start', goal, opts),
    message: (id: string, text: string, files?: string[]): Promise<void> =>
      ipcRenderer.invoke('orch:message', id, text, files),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('orch:delete', id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke('orch:stop', id),
    answer: (id: string, ans: OrchAnswer): Promise<void> =>
      ipcRenderer.invoke('orch:answer', id, ans),
    resume: (id: string): Promise<void> => ipcRenderer.invoke('orch:resume', id),
    restoreStep: (id: string, stepId: string): Promise<void> =>
      ipcRenderer.invoke('orch:restoreStep', id, stepId),
    onUpdate: (cb: (o: Orchestration) => void): Unsubscribe => on('orch:update', cb)
  },
  templates: {
    list: (): Promise<Array<{ id: string; name: string; description: string }>> =>
      ipcRenderer.invoke('templates:list'),
    apply: (templateId: string): Promise<string[]> =>
      ipcRenderer.invoke('templates:apply', templateId)
  },
  telegram: {
    status: (): Promise<TelegramStatus> => ipcRenderer.invoke('telegram:status'),
    setToken: (t: string): Promise<TelegramStatus> => ipcRenderer.invoke('telegram:setToken', t),
    removeToken: (): Promise<TelegramStatus> => ipcRenderer.invoke('telegram:removeToken'),
    pair: (): Promise<TelegramStatus> => ipcRenderer.invoke('telegram:pair'),
    unpair: (): Promise<TelegramStatus> => ipcRenderer.invoke('telegram:unpair'),
    test: (): Promise<void> => ipcRenderer.invoke('telegram:test'),
    onStatus: (cb: (s: TelegramStatus) => void): Unsubscribe => on('telegram:status', cb)
  },
  usage: {
    summary: (): Promise<UsageSummary> => ipcRenderer.invoke('usage:summary')
  },
  dialog: {
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pickFiles')
  },
  fs: {
    list: (orchId: string, rel: string): Promise<WorkdirEntry[]> =>
      ipcRenderer.invoke('fs:list', orchId, rel),
    open: (orchId: string, rel: string): Promise<void> =>
      ipcRenderer.invoke('fs:open', orchId, rel),
    openAgentDir: (agentId: string): Promise<void> =>
      ipcRenderer.invoke('fs:openAgentDir', agentId),
    import: (orchId: string, paths: string[]): Promise<string[]> =>
      ipcRenderer.invoke('fs:import', orchId, paths),
    saveTemp: (name: string, bytes: ArrayBuffer): Promise<string> =>
      ipcRenderer.invoke('fs:saveTemp', name, bytes),
    /** Sürüklenen dosyanın diskteki yolu */
    pathForFile: (f: File): string => webUtils.getPathForFile(f)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (index.d.ts içinde tanımlı)
  window.api = api
}
