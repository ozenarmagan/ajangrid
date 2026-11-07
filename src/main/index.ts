import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { pathToFileURL } from 'url'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join, resolve, sep } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type {
  Agent,
  ApiProvider,
  LocalTool,
  OrchAnswer,
  Settings,
  StartGoalOptions,
  WorkdirEntry
} from '../shared/types'
import { loadData, newId, update } from './store'
import { apiKeyStatuses, removeApiKey, setApiKey } from './secrets'
import { detectClis } from './engines/detect'
import { ensureDir, resolveWorkdir, RunManager } from './runner'
import { loadLoginShellPath } from './shellEnv'
import { Orchestrator } from './orchestrator'
import { applyTemplate, TEMPLATES } from './templates'
import { summary as usageSummary } from './usage'
import { TelegramBot } from './telegram'
import { notifyOrch, Scheduler } from './scheduler'
import { exportAgents, importAgents } from './teamio'
import { copyInto } from './files'

let mainWindow: BrowserWindow | null = null

// Uygulama içi dosya önizleme: ajfile://<hedefId>/<göreli yol>
// Yalnızca hedeflerin çalışma klasörlerindeki dosyalar sunulur.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ajfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

const send = (channel: string, payload: unknown): void => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const runs = new RunManager(send)
const orch = new Orchestrator(runs, send, () => broadcastData())
orch.onEvent(notifyOrch)
const telegram = new TelegramBot(
  orch,
  (st) => send('telegram:status', st),
  () => broadcastData()
)
const scheduler = new Scheduler(orch, () => broadcastData())

function broadcastData(): void {
  send('data:changed', loadData())
}

function createWindow(): void {
  const data = loadData()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 620,
    show: false,
    title: 'AjanGrid',
    backgroundColor: data.settings.theme === 'light' ? '#f4f4f6' : '#09090b',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Kullanıcının verdiği göreli yolun ekip klasörünün dışına çıkmadığından emin ol. */
function safeJoin(root: string, rel: string): string | null {
  const base = resolve(root)
  const abs = resolve(base, rel)
  if (abs !== base && !abs.startsWith(base + sep)) return null
  return abs
}

function listDir(root: string, rel: string): WorkdirEntry[] {
  const dir = safeJoin(root, rel)
  if (!dir) return []
  try {
    return readdirSync(dir)
      .filter((n) => n !== '.ajangrid' && !n.startsWith('.DS_Store'))
      .map((name) => {
        const st = statSync(join(dir, name))
        return {
          name,
          relPath: rel ? `${rel}/${name}` : name,
          isDir: st.isDirectory(),
          size: st.size,
          mtime: st.mtimeMs
        }
      })
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || b.mtime - a.mtime)
  } catch {
    return []
  }
}

function registerIpc(): void {
  ipcMain.handle('data:load', () => loadData())

  ipcMain.handle('agents:save', (_e, agent: Agent) => {
    const saved: Agent = {
      ...agent,
      id: agent.id || newId(),
      createdAt: agent.createdAt || Date.now()
    }
    update((d) => {
      // Tek yönetici olabilir
      if (saved.isManager) {
        d.agents.forEach((a) => {
          if (a.id !== saved.id) a.isManager = false
        })
      }
      const i = d.agents.findIndex((a) => a.id === saved.id)
      if (i >= 0) d.agents[i] = saved
      else d.agents.push(saved)
    })
    broadcastData()
    return saved
  })

  ipcMain.handle('agents:delete', (_e, id: string) => {
    update((d) => {
      d.agents = d.agents.filter((a) => a.id !== id)
      d.settings.checkpoints = (d.settings.checkpoints ?? []).filter((x) => x !== id)
    })
    broadcastData()
  })

  ipcMain.handle('agents:export', async () => {
    if (!mainWindow) return null
    const file = exportAgents(loadData())
    const r = await dialog.showSaveDialog(mainWindow, {
      title: 'Ajanları dışa aktar',
      defaultPath: 'ajanlar.ajangrid.json',
      filters: [{ name: 'AjanGrid ajan paketi', extensions: ['json'] }]
    })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, JSON.stringify(file, null, 2), 'utf8')
    return r.filePath
  })

  ipcMain.handle('agents:import', async () => {
    if (!mainWindow) return null
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: 'Ajan paketini seç',
      properties: ['openFile'],
      filters: [{ name: 'AjanGrid ajan paketi', extensions: ['json'] }]
    })
    if (pick.canceled || !pick.filePaths[0]) return null
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(pick.filePaths[0], 'utf8'))
    } catch {
      throw new Error('Dosya okunamadı ya da geçerli JSON değil.')
    }
    let result = { added: [] as string[], warnings: [] as string[] }
    update((d) => {
      result = importAgents(d, raw)
    })
    broadcastData()
    return result
  })

  ipcMain.handle('tools:save', (_e, tool: LocalTool) => {
    const saved: LocalTool = { ...tool, id: tool.id || newId() }
    update((d) => {
      const i = d.localTools.findIndex((t) => t.id === saved.id)
      if (i >= 0) d.localTools[i] = saved
      else d.localTools.push(saved)
    })
    broadcastData()
    return saved
  })

  ipcMain.handle('tools:delete', (_e, id: string) => {
    update((d) => {
      d.localTools = d.localTools.filter((t) => t.id !== id)
    })
    broadcastData()
  })

  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    update((d) => {
      d.settings = { ...d.settings, ...patch }
    })
    broadcastData()
  })

  ipcMain.handle('clis:detect', (_e, force?: boolean) => detectClis(Boolean(force)))

  ipcMain.handle('keys:list', () => apiKeyStatuses())
  ipcMain.handle('keys:set', (_e, provider: ApiProvider, key: string) => {
    setApiKey(provider, key)
    return apiKeyStatuses()
  })
  ipcMain.handle('keys:remove', (_e, provider: ApiProvider) => {
    removeApiKey(provider)
    return apiKeyStatuses()
  })

  ipcMain.handle('runs:start', async (_e, agentId: string, prompt: string) => {
    const data = loadData()
    const agent = data.agents.find((a) => a.id === agentId)
    if (!agent) throw new Error('Ajan bulunamadı.')
    if (!prompt.trim()) throw new Error('Görev boş olamaz.')
    return runs.start(data, agent, prompt)
  })
  ipcMain.handle('runs:stop', (_e, runId: string) => runs.stop(runId))
  ipcMain.handle('runs:stopAll', () => runs.stopAll())
  ipcMain.handle('runs:list', () => runs.list())
  ipcMain.handle('runs:output', (_e, runId: string) => runs.output(runId))
  ipcMain.handle('runs:clear', (_e, agentId?: string) => runs.clearFinished(agentId))
  ipcMain.handle('runs:preview', (_e, agent: Agent) => runs.preview(loadData(), agent))

  ipcMain.handle('orch:list', () => orch.list())
  ipcMain.handle('orch:start', (_e, goal: string, opts?: StartGoalOptions) => {
    if (!goal.trim() && !opts?.files?.length) throw new Error('Hedef boş olamaz.')
    return orch.start(goal.trim() || 'Eklenen dosyaları incele.', opts)
  })
  ipcMain.handle('orch:message', (_e, id: string, text: string, files?: string[]) =>
    orch.message(id, text, files)
  )
  ipcMain.handle('orch:delete', (_e, id: string) => orch.remove(id))
  ipcMain.handle('orch:stop', (_e, id: string) => orch.stop(id))
  ipcMain.handle('orch:answer', (_e, id: string, ans: OrchAnswer) => orch.answer(id, ans))
  ipcMain.handle('orch:resume', (_e, id: string) => orch.resume(id))
  ipcMain.handle('orch:restoreStep', (_e, id: string, stepId: string) =>
    orch.restoreStep(id, stepId)
  )

  ipcMain.handle('templates:list', () => TEMPLATES)
  ipcMain.handle('templates:apply', (_e, templateId: string) => {
    let added: string[] = []
    update((d) => {
      added = applyTemplate(d, templateId)
    })
    broadcastData()
    return added
  })

  ipcMain.handle('telegram:status', () => telegram.status())
  ipcMain.handle('telegram:setToken', (_e, token: string) => telegram.setToken(token))
  ipcMain.handle('telegram:removeToken', () => telegram.removeToken())
  ipcMain.handle('telegram:pair', () => telegram.startPairing())
  ipcMain.handle('telegram:unpair', () => telegram.unpair())
  ipcMain.handle('telegram:test', () => telegram.sendTest())

  ipcMain.handle('usage:summary', () => usageSummary(loadData().settings))

  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  const goalDir = (orchId: string): string | null => orch.get(orchId)?.workdir ?? null

  ipcMain.handle('fs:list', (_e, orchId: string, rel: string) => {
    const dir = goalDir(orchId)
    if (!dir) return []
    ensureDir(dir)
    return listDir(dir, rel || '')
  })

  ipcMain.handle('fs:open', (_e, orchId: string, rel: string) => {
    const dir = goalDir(orchId)
    if (!dir) return
    const abs = safeJoin(dir, rel || '')
    if (abs) shell.openPath(abs)
  })

  // Sürükle-bırak: dosyaları hedef klasöründeki kaynak/ altına kopyala
  ipcMain.handle('fs:import', (_e, orchId: string, paths: string[]) => {
    const dir = goalDir(orchId)
    if (!dir) throw new Error('Hedef bulunamadı.')
    return copyInto(dir, paths)
  })

  // Yapıştırılan görseller gibi yolu olmayan dosyalar: geçici klasöre yazılır
  ipcMain.handle('fs:saveTemp', (_e, name: string, bytes: ArrayBuffer) => {
    const dir = join(tmpdir(), 'ajangrid-ekler', newId().slice(0, 8))
    mkdirSync(dir, { recursive: true })
    const safe = basename(name || 'ek').replace(/[^\p{L}\p{N}._ -]+/gu, '_') || 'ek'
    const p = join(dir, safe)
    writeFileSync(p, Buffer.from(bytes))
    return p
  })

  ipcMain.handle('dialog:pickFiles', async () => {
    if (!mainWindow) return []
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Eklenecek dosyaları seç',
      properties: ['openFile', 'multiSelections']
    })
    return r.canceled ? [] : r.filePaths
  })

  ipcMain.handle('fs:openAgentDir', (_e, agentId: string) => {
    const data = loadData()
    const agent = data.agents.find((a) => a.id === agentId)
    if (!agent) return
    const dir = resolveWorkdir(data, agent)
    ensureDir(dir)
    shell.openPath(dir)
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hngbilisim.ajangrid')
  protocol.handle('ajfile', (req) => {
    const u = new URL(req.url)
    const o = orch.list().find((x) => x.id.toLowerCase() === u.hostname.toLowerCase())
    const rel = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
    const abs = o ? safeJoin(o.workdir, rel) : null
    if (!abs || !existsSync(abs)) return new Response('Bulunamadı', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString(), { headers: req.headers })
  })
  loadLoginShellPath()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  detectClis().catch(() => undefined)
  telegram.start()
  scheduler.start()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  telegram.stop()
  scheduler.stop()
  runs.stopAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
