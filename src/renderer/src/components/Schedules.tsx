import { useState } from 'react'
import type { Schedule } from '../../../shared/types'
import { useActiveTeam, useStore } from '../store'
import { Trash } from './Icons'

const DAYS = [
  { d: 1, l: 'Pzt' },
  { d: 2, l: 'Sal' },
  { d: 3, l: 'Çar' },
  { d: 4, l: 'Per' },
  { d: 5, l: 'Cum' },
  { d: 6, l: 'Cmt' },
  { d: 0, l: 'Paz' }
]

function daysText(days: number[]): string {
  if (days.length === 7) return 'Her gün'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Hafta içi'
  return DAYS.filter((x) => days.includes(x.d))
    .map((x) => x.l)
    .join(', ')
}

/** Yönetici ekranı: ekibin zamanlanmış hedefleri + yeni zamanlama formu. */
export function Schedules({
  goal,
  onCreated
}: {
  goal: string
  onCreated: () => void
}): React.JSX.Element {
  const { data } = useStore()
  const team = useActiveTeam()
  const all = data?.settings.schedules ?? []
  const mine = all.filter((s) => s.teamId === team?.id)
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [time, setTime] = useState('09:00')

  const save = (next: Schedule[]): void => {
    window.api.settings.set({ schedules: next })
  }

  const add = (): void => {
    if (!team || !goal.trim() || !days.length) return
    save([
      ...all,
      {
        id: crypto.randomUUID(),
        teamId: team.id,
        goal: goal.trim(),
        days: [...days].sort(),
        time,
        enabled: true
      }
    ])
    onCreated()
  }

  return (
    <div className="card" style={{ gap: 10, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Zamanlanmış hedefler</div>
      {mine.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            aria-label="Etkin"
            checked={s.enabled}
            onChange={(e) =>
              save(all.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)))
            }
          />
          <span className="mono" style={{ whiteSpace: 'nowrap' }}>
            {daysText(s.days)} · {s.time}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={s.goal}
          >
            {s.goal}
          </span>
          <button
            className="ib"
            aria-label="Zamanlamayı sil"
            onClick={() => save(all.filter((x) => x.id !== s.id))}
          >
            <Trash />
          </button>
        </div>
      ))}
      {!mine.length ? <div className="hint">Bu ekipte zamanlanmış hedef yok.</div> : null}

      <div
        style={{
          borderTop: '1px solid var(--w08)',
          paddingTop: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div className="hint">Hedef kutusundaki metni zamanla:</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {DAYS.map((x) => (
            <button
              key={x.d}
              className={`chip ${days.includes(x.d) ? 'on' : ''}`}
              aria-pressed={days.includes(x.d)}
              onClick={() =>
                setDays(days.includes(x.d) ? days.filter((y) => y !== x.d) : [...days, x.d])
              }
            >
              {x.l}
            </button>
          ))}
          <label htmlFor="sch-time" className="sr">
            Saat
          </label>
          <input
            id="sch-time"
            type="time"
            className="inp"
            style={{ width: 110, minHeight: 30, padding: '2px 8px' }}
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
          <button
            className="btn btn-sm btn-p"
            onClick={add}
            disabled={!goal.trim() || !days.length}
          >
            Zamanla
          </button>
        </div>
        <div className="hint">Zamanlanmış hedefler yalnızca AjanGrid açıkken çalışır.</div>
      </div>
    </div>
  )
}
