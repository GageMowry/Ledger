import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, type Meal, type Task } from '../db'
import { SLOTS, dayTotals, getTargets } from '../meals'
import { navigate } from '../router'
import { todayISO } from '../dates'
import { compareOpen } from '../tasks'
import TaskRow from '../components/TaskRow'

const DAY = 24 * 60 * 60 * 1000

export default function Today() {
  const lastBackupAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [], null)
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('geminiApiKey', '')), [], true)

  // Due today or overdue, plus anything checked off today so it doesn't vanish on tap.
  const startOfDay = new Date().setHours(0, 0, 0, 0)
  const today = todayISO()
  const loaded = useLiveQuery(() => db.tasks.toArray(), [])
  const tasks: Task[] = loaded ?? []
  const openCount = tasks.filter((t) => !t.done).length
  const dueTasks = tasks
    .filter((t) => !!t.dueDate && t.dueDate <= today && (!t.done || (t.completedAt ?? 0) >= startOfDay))
    .sort((a, b) => Number(a.done) - Number(b.done) || compareOpen(a, b))

  const meals = useLiveQuery(async () => {
    const logs = await db.mealLogs.where('date').equals(today).toArray()
    const ids = [...new Set(logs.map((l) => l.mealId))]
    const list = (await db.meals.bulkGet(ids)).filter((m): m is Meal => !!m)
    const targets = await getTargets()
    return { logs, targets, totals: dayTotals(logs, new Map(list.map((m) => [m.id, m]))) }
  }, [today])

  const now = new Date()
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const backupStale = !lastBackupAt || Date.now() - lastBackupAt > 7 * DAY

  return (
    <div className="space-y-4">
      <div>
        <p className="text-2xl font-semibold">{greeting}</p>
        <p className="text-slate-500 dark:text-slate-400">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {!hasKey && (
        <button type="button" onClick={() => navigate('settings')} className="card block w-full text-left">
          <p className="font-medium">Add your Gemini API key</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">Needed for photo tagging and suggestions.</p>
        </button>
      )}

      {backupStale && (
        <button
          type="button"
          onClick={() => navigate('settings')}
          className="card block w-full text-left ring-amber-300 dark:ring-amber-700"
        >
          <p className="font-medium">{lastBackupAt ? 'Time for a backup' : 'No backup yet'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Your data lives only on this device. Export a backup to Files or iCloud.
          </p>
        </button>
      )}

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Tasks due</h2>
          <button
            type="button"
            onClick={() => navigate('tasks')}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
          >
            All tasks
          </button>
        </div>
        {dueTasks.length ? (
          <ul className="mt-1 divide-y divide-slate-100 dark:divide-slate-800">
            {dueTasks.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={() => navigate('tasks')} />
            ))}
          </ul>
        ) : loaded === undefined ? null : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {openCount ? `Nothing due today. ${openCount} open task${openCount === 1 ? '' : 's'} total.` : 'No open tasks.'}
          </p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Meals today</h2>
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem('ledger.meals.section', 'log')
              } catch {
                /* storage unavailable */
              }
              navigate('meals')
            }}
            className="text-sm font-medium text-indigo-600 dark:text-indigo-400"
          >
            Log a meal
          </button>
        </div>
        {meals && meals.logs.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {SLOTS.map((s) => {
              const items = meals.logs.filter((l) => l.slot === s.key)
              if (!items.length) return null
              return (
                <li key={s.key} className="flex gap-2">
                  <span className="w-20 shrink-0 text-slate-500 dark:text-slate-400">{s.label}</span>
                  <span>{items.map((l) => l.name).join(', ')}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          meals && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Nothing logged yet.</p>
        )}
        {meals?.targets.enabled && meals.targets.calories && meals.logs.length > 0 && (
          <p className="mt-2 text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {Math.round(meals.totals.calories).toLocaleString()} / {meals.targets.calories.toLocaleString()} cal
            {meals.targets.protein ? ` · ${Math.round(meals.totals.protein)} / ${meals.targets.protein}g protein` : ''}
          </p>
        )}
      </section>

      <div className="card">
        <p className="text-sm text-slate-500 dark:text-slate-400">Outfit ideas will show up here once the closet is built.</p>
      </div>
    </div>
  )
}
