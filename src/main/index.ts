import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { readdirSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type {
  Agent,
  ApiProvider,
  LocalTool,
  OrchAnswer,
  Settings,
  Team,
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

let mainWindow: BrowserWindow | null = null

const send = (channel: string, payload: unknown): void => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

const runs = new RunManager(send)
const orch = new Orchestrator(runs, send, () => broadcastData())

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
      // Bir ekipte tek yönetici olabilir
      if (saved.isManager) {
        d.agents.forEach((a) => {
          if (a.teamId === saved.teamId && a.id !== saved.id) a.isManager = false
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
    })
    broadcastData()
  })

  ipcMain.handle('teams:save', (_e, team: Team) => {
    const saved: Team = { ...team, id: team.id || newId() }
    update((d) => {
      const i = d.teams.findIndex((t) => t.id === saved.id)
      if (i >= 0) d.teams[i] = saved
      else d.teams.push(saved)
      if (!d.settings.activeTeamId) d.settings.activeTeamId = saved.id
    })
    broadcastData()
    return saved
  })

  ipcMain.handle('teams:delete', (_e, id: string) => {
    if (loadData().teams.length <= 1) throw new Error('Son ekip silinemez.')
    // Süren yönetici döngülerini ve çalışmaları durdur
    orch.list(id).forEach((o) => orch.stop(o.id))
    runs.stopTeam(id)
    update((d) => {
      if (d.teams.length <= 1) return
      d.teams = d.teams.filter((t) => t.id !== id)
      d.agents = d.agents.filter((a) => a.teamId !== id)
      if (d.settings.activeTeamId === id) d.settings.activeTeamId = d.teams[0]?.id ?? null
    })
    broadcastData()
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

  ipcMain.handle('orch:list', (_e, teamId: string) => orch.list(teamId))
  ipcMain.handle('orch:start', (_e, teamId: string, goal: string, checkpoints?: string[]) => {
    if (!goal.trim()) throw new Error('Hedef boş olamaz.')
    return orch.start(teamId, goal.trim(), checkpoints)
  })
  ipcMain.handle('orch:stop', (_e, id: string) => orch.stop(id))
  ipcMain.handle('orch:answer', (_e, id: string, ans: OrchAnswer) => orch.answer(id, ans))

  ipcMain.handle('templates:list', () => TEMPLATES)
  ipcMain.handle('templates:apply', (_e, templateId: string, name: string, workdir: string) => {
    let teamId = ''
    update((d) => {
      const t = applyTemplate(d, templateId, name, workdir)
      teamId = t.id
      d.settings.activeTeamId = t.id
    })
    ensureDir(workdir)
    broadcastData()
    return teamId
  })

  ipcMain.handle('usage:summary', () => usageSummary(loadData().settings))

  ipcMain.handle('dialog:pickFolder', async () => {
    if (!mainWindow) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  })

  ipcMain.handle('fs:list', (_e, teamId: string, rel: string) => {
    const data = loadData()
    const team = data.teams.find((t) => t.id === teamId)
    if (!team) return []
    ensureDir(team.workdir)
    return listDir(team.workdir, rel || '')
  })

  ipcMain.handle('fs:open', (_e, teamId: string, rel: string) => {
    const team = loadData().teams.find((t) => t.id === teamId)
    if (!team) return
    const abs = safeJoin(team.workdir, rel || '')
    if (abs) shell.openPath(abs)
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
  loadLoginShellPath()
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))
  registerIpc()
  createWindow()
  detectClis().catch(() => undefined)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => runs.stopAll())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
