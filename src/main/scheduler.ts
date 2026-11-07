import { BrowserWindow, Notification } from 'electron'
import type { Orchestration } from '../shared/types'
import { loadData, update } from './store'
import type { Orchestrator, OrchEvent } from './orchestrator'

// Zamanlanmış hedefler (uygulama açıkken çalışır) ve masaüstü bildirimleri.

export class Scheduler {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private orch: Orchestrator,
    private onDataChanged: () => void
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 30_000)
    this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    const data = loadData()
    const now = new Date()
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    for (const s of data.settings.schedules ?? []) {
      if (!s.enabled || s.time !== hhmm || !s.days.includes(now.getDay())) continue
      if (s.lastRunAt && Date.now() - s.lastRunAt < 5 * 60_000) continue
      const team = data.teams.find((t) => t.id === s.teamId)
      if (!team) continue
      update((d) => {
        const x = d.settings.schedules?.find((y) => y.id === s.id)
        if (x) x.lastRunAt = Date.now()
      })
      this.onDataChanged()
      if (this.orch.active().some((o) => o.teamId === team.id)) {
        notify(
          'Zamanlanmış hedef atlandı',
          `"${team.name}" ekibinde süren bir iş vardı: ${s.goal.slice(0, 80)}`
        )
        continue
      }
      try {
        this.orch.start(team.id, s.goal, team.checkpoints)
        notify('Zamanlanmış hedef başladı', `${team.name}: ${s.goal.slice(0, 100)}`)
      } catch (err) {
        notify('Zamanlanmış hedef başlatılamadı', (err as Error).message)
      }
    }
  }
}

export function notify(title: string, body: string): void {
  if (loadData().settings.notifications === false || !Notification.isSupported()) return
  const n = new Notification({ title, body: body.slice(0, 240) })
  n.on('click', () => {
    const w = BrowserWindow.getAllWindows()[0]
    if (w) {
      if (w.isMinimized()) w.restore()
      w.show()
      w.focus()
    }
  })
  n.show()
}

export function notifyOrch(kind: OrchEvent, o: Orchestration): void {
  const team = loadData().teams.find((t) => t.id === o.teamId)?.name ?? 'AjanGrid'
  if (kind === 'question') {
    const k = o.question?.kind
    const title =
      k === 'approval'
        ? 'Onay gerekiyor'
        : k === 'team'
          ? 'Ekip önerisi'
          : k === 'limit'
            ? 'Limit doldu'
            : 'Yöneticinin sorusu'
    notify(`${title} · ${team}`, o.question?.text ?? '')
  } else if (kind === 'done') {
    notify(`Tamamlandı · ${team}`, o.summary ?? o.goal)
  } else {
    notify(`Hata · ${team}`, o.error ?? o.goal)
  }
}
