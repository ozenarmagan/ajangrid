import type { Orchestration, TelegramStatus } from '../shared/types'
import { getApiKey, removeApiKey, setApiKey } from './secrets'
import { loadData, update } from './store'
import type { Orchestrator, OrchEvent } from './orchestrator'

// Telegram botu: yönetici onay beklerken telefona mesaj gönderir; düğmeyle onay,
// yazarak yanıt/düzeltme, /hedef ile yeni hedef başlatma. Uzun yoklama (getUpdates)
// kullanılır, sunucu ya da açık port gerekmez. Yalnızca eşleştirilmiş sohbet dinlenir.

const API = 'https://api.telegram.org/bot'
const PAIR_MS = 10 * 60_000
const MAX_TEXT = 3800

interface TgUpdate {
  update_id: number
  message?: {
    chat: { id: number; first_name?: string; username?: string; title?: string }
    text?: string
  }
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } }
}

function clip(s: string, n = MAX_TEXT): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export class TelegramBot {
  private abort: AbortController | null = null
  private offset = 0
  private running = false
  private pairCode: string | null = null
  private pairUntil = 0
  private lastError: string | null = null
  private botName: string | null = null

  constructor(
    private orch: Orchestrator,
    private onStatus: (s: TelegramStatus) => void,
    private onDataChanged: () => void
  ) {
    orch.onEvent((kind, o) => void this.onOrchEvent(kind, o))
  }

  status(): TelegramStatus {
    const s = loadData().settings
    return {
      hasToken: Boolean(getApiKey('telegram')),
      botName: this.botName,
      chatName: s.telegramChatName ?? null,
      paired: Boolean(s.telegramChatId),
      pairCode: this.pairCode && Date.now() < this.pairUntil ? this.pairCode : null,
      running: this.running,
      error: this.lastError
    }
  }

  private emitStatus(): void {
    this.onStatus(this.status())
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const token = getApiKey('telegram')
    if (!token) throw new Error('Telegram bot anahtarı yok.')
    const res = await fetch(`${API}${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal
    })
    const json = (await res.json()) as { ok: boolean; result: T; description?: string }
    if (!json.ok) throw new Error(json.description ?? `Telegram hatası (${res.status})`)
    return json.result
  }

  async setToken(token: string): Promise<TelegramStatus> {
    const t = token.trim()
    if (!/^\d+:[\w-]{20,}$/.test(t))
      throw new Error('Bu bir Telegram bot anahtarına benzemiyor (ör. 123456:ABC…).')
    setApiKey('telegram', t)
    try {
      const me = await this.call<{ username: string }>('getMe', {})
      this.botName = me.username
    } catch (err) {
      removeApiKey('telegram')
      throw new Error(`Anahtar doğrulanamadı: ${(err as Error).message}`)
    }
    // Yeni bot: eski eşleşme geçersiz
    update((d) => {
      d.settings.telegramChatId = undefined
      d.settings.telegramChatName = undefined
    })
    this.onDataChanged()
    this.restart()
    return this.status()
  }

  removeToken(): TelegramStatus {
    this.stop()
    removeApiKey('telegram')
    update((d) => {
      d.settings.telegramChatId = undefined
      d.settings.telegramChatName = undefined
    })
    this.botName = null
    this.onDataChanged()
    this.emitStatus()
    return this.status()
  }

  startPairing(): TelegramStatus {
    if (!getApiKey('telegram')) throw new Error('Önce bot anahtarını kaydet.')
    this.pairCode = String(Math.floor(100000 + Math.random() * 900000))
    this.pairUntil = Date.now() + PAIR_MS
    if (!this.running) this.start()
    this.emitStatus()
    return this.status()
  }

  unpair(): TelegramStatus {
    update((d) => {
      d.settings.telegramChatId = undefined
      d.settings.telegramChatName = undefined
    })
    this.onDataChanged()
    this.emitStatus()
    return this.status()
  }

  async sendTest(): Promise<void> {
    await this.send(
      'AjanGrid bağlantısı çalışıyor ✅\n\nKomutlar:\n/hedef <metin> — aktif ekibe yeni hedef ver\n/durum — süren işler'
    )
  }

  start(): void {
    if (this.running || !getApiKey('telegram')) return
    this.running = true
    this.lastError = null
    this.emitStatus()
    if (!this.botName) {
      this.call<{ username: string }>('getMe', {})
        .then((me) => {
          this.botName = me.username
          this.emitStatus()
        })
        .catch(() => undefined)
    }
    void this.poll()
  }

  stop(): void {
    this.running = false
    this.abort?.abort()
    this.abort = null
    this.emitStatus()
  }

  private restart(): void {
    this.stop()
    this.offset = 0
    this.start()
  }

  private async poll(): Promise<void> {
    let backoff = 2000
    while (this.running) {
      this.abort = new AbortController()
      try {
        const updates = await this.call<TgUpdate[]>(
          'getUpdates',
          { offset: this.offset, timeout: 25, allowed_updates: ['message', 'callback_query'] },
          this.abort.signal
        )
        backoff = 2000
        if (this.lastError) {
          this.lastError = null
          this.emitStatus()
        }
        for (const u of updates) {
          this.offset = u.update_id + 1
          await this.handle(u).catch((err) => console.error('[telegram]', err))
        }
      } catch (err) {
        if (!this.running) return
        this.lastError = (err as Error).message
        this.emitStatus()
        await new Promise((r) => setTimeout(r, backoff))
        backoff = Math.min(backoff * 2, 60_000)
      }
    }
  }

  private chatId(): number | undefined {
    return loadData().settings.telegramChatId
  }

  private async send(
    text: string,
    buttons?: Array<Array<{ text: string; data: string }>>
  ): Promise<void> {
    const chat = this.chatId()
    if (!chat || !getApiKey('telegram')) return
    await this.call('sendMessage', {
      chat_id: chat,
      text: clip(text),
      ...(buttons
        ? {
            reply_markup: {
              inline_keyboard: buttons.map((row) =>
                row.map((b) => ({ text: b.text, callback_data: b.data }))
              )
            }
          }
        : {})
    }).catch((err) => {
      this.lastError = (err as Error).message
      this.emitStatus()
    })
  }

  private async handle(u: TgUpdate): Promise<void> {
    const paired = this.chatId()

    if (u.callback_query) {
      const cq = u.callback_query
      if (!paired || cq.message?.chat.id !== paired) return
      // callback_data en fazla 64 bayt: kimliklerin ilk 8 karakteri gönderilir
      const [cmd, orchKey, qKey] = (cq.data ?? '').split(':')
      const o = this.orch.findByPrefix(orchKey ?? '')
      const qid = qKey && o?.question?.id.startsWith(qKey) ? o.question.id : qKey ? '-' : ''
      let note = 'Bu soru artık geçerli değil.'
      if (o && o.status === 'waiting' && o.question && (!qid || o.question.id === qid)) {
        if (cmd === 'ok') {
          this.orch.answer(o.id, {
            approve: true,
            text:
              o.question.kind === 'approval' || o.question.kind === 'team' ? undefined : 'Devam et.'
          })
          note = 'Onaylandı ✅'
        } else if (cmd === 'stop') {
          this.orch.stop(o.id)
          note = 'Durduruldu ⏹'
        }
      } else if (o && cmd === 'stop' && o.status === 'running') {
        this.orch.stop(o.id)
        note = 'Durduruldu ⏹'
      }
      await this.call('answerCallbackQuery', { callback_query_id: cq.id, text: note }).catch(
        () => undefined
      )
      return
    }

    const msg = u.message
    if (!msg?.text) return
    const text = msg.text.trim()

    // Eşleştirme: "/start 123456" ya da yalnızca kod
    if (this.pairCode && Date.now() < this.pairUntil) {
      const code = text.replace(/^\/start\s*/, '').trim()
      if (code === this.pairCode) {
        const name =
          msg.chat.title || msg.chat.first_name || msg.chat.username || String(msg.chat.id)
        update((d) => {
          d.settings.telegramChatId = msg.chat.id
          d.settings.telegramChatName = name
        })
        this.pairCode = null
        this.onDataChanged()
        this.emitStatus()
        await this.send(
          'Eşleşti ✅ Yönetici onay beklediğinde buraya yazacağım.\n\n/hedef <metin> — aktif ekibe yeni hedef\n/durum — süren işler'
        )
        return
      }
    }
    if (!paired || msg.chat.id !== paired) return

    if (text.startsWith('/hedef')) {
      const goal = text.replace(/^\/hedef(@\w+)?\s*/, '').trim()
      if (!goal) return this.send('Kullanım: /hedef <yöneticiye verilecek hedef>')
      const data = loadData()
      const teamId = data.settings.activeTeamId ?? data.teams[0]?.id
      const team = data.teams.find((t) => t.id === teamId)
      if (!team) return this.send('Aktif ekip yok.')
      if (this.orch.active().some((o) => o.teamId === team.id)) {
        return this.send(
          `"${team.name}" ekibinde süren bir iş var. Önce bitmesini bekle ya da durdur.`
        )
      }
      try {
        this.orch.start(team.id, goal, team.checkpoints)
        return this.send(`"${team.name}" ekibine hedef verildi. Onay gerektiğinde yazacağım.`)
      } catch (err) {
        return this.send(`Başlatılamadı: ${(err as Error).message}`)
      }
    }

    if (text.startsWith('/durum')) {
      const act = this.orch.active()
      if (!act.length) return this.send('Süren iş yok.')
      const data = loadData()
      const lines = act.map((o) => {
        const team = data.teams.find((t) => t.id === o.teamId)?.name ?? '?'
        const last = [...o.steps].reverse().find((s) => s.kind === 'task')
        const ag = data.agents.find((a) => a.id === last?.agentId)?.name
        return `• ${team}: ${o.status === 'waiting' ? 'yanıtını bekliyor' : 'çalışıyor'}\n  Hedef: ${clip(o.goal, 120)}${ag ? `\n  Son görev: ${ag} — ${clip(last?.task ?? '', 120)}` : ''}`
      })
      return this.send(lines.join('\n\n'))
    }

    // Serbest metin: bekleyen en son soruya yanıt
    const waiting = this.orch.active().filter((o) => o.status === 'waiting' && o.question)
    const target = waiting[waiting.length - 1]
    if (!target?.question) {
      return this.send(
        'Şu an yanıt bekleyen bir soru yok.\n\n/hedef <metin> — yeni hedef\n/durum — süren işler'
      )
    }
    const kind = target.question.kind
    if (kind === 'approval' || kind === 'team')
      this.orch.answer(target.id, { approve: false, text })
    else this.orch.answer(target.id, { approve: true, text })
    return this.send(
      kind === 'approval' || kind === 'team'
        ? 'Düzeltme yöneticiye iletildi ✍️'
        : 'Yanıtın iletildi ✍️'
    )
  }

  private async onOrchEvent(kind: OrchEvent, o: Orchestration): Promise<void> {
    if (!this.chatId()) return
    const data = loadData()
    const team = data.teams.find((t) => t.id === o.teamId)?.name ?? 'Ekip'
    if (kind === 'question' && o.question) {
      const q = o.question
      const head =
        q.kind === 'approval'
          ? '🟡 Onay gerekiyor'
          : q.kind === 'team'
            ? '🟡 Ekip önerisi'
            : q.kind === 'limit'
              ? '🟠 Limit doldu'
              : '❓ Yöneticinin sorusu'
      let body = q.text
      if (q.kind === 'team' && q.proposals) {
        body +=
          '\n\n' +
          q.proposals
            .map(
              (p) =>
                `• ${p.name} — ${p.title}${p.warnings?.length ? ` ⚠ ${p.warnings.join(', ')}` : ''}`
            )
            .join('\n')
      }
      const hint =
        q.kind === 'approval' || q.kind === 'team'
          ? '\n\nOnaylamak için düğmeye bas, düzeltme için mesaj yaz.'
          : '\n\nYanıtını mesaj olarak yaz ya da "Devam et"e bas.'
      await this.send(`${head} · ${team}\n\n${body}${hint}`, [
        [
          {
            text: q.kind === 'approval' || q.kind === 'team' ? '✅ Onayla' : '▶️ Devam et',
            data: `ok:${o.id.slice(0, 8)}:${q.id.slice(0, 8)}`
          },
          { text: '⏹ Durdur', data: `stop:${o.id.slice(0, 8)}:${q.id.slice(0, 8)}` }
        ]
      ])
    } else if (kind === 'done') {
      await this.send(
        `✅ Tamamlandı · ${team}\n\nHedef: ${clip(o.goal, 200)}\n\n${o.summary ?? ''}`
      )
    } else if (kind === 'error') {
      await this.send(`❌ Hata · ${team}\n\nHedef: ${clip(o.goal, 200)}\n\n${o.error ?? ''}`)
    }
  }
}
