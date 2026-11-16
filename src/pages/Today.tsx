import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, type Task } from '../db'
import { getStaples } from '../meals'
import { MEALS_SECTION_KEY } from './Meals'
import { CLOSET_SECTION_KEY } from './Closet'
import { navigate } from '../router'
import { addDays, friendlyDate, todayISO } from '../dates'
import { fmtNum } from '../body'
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

  const meals = useLiveQuery(async () => ({ favorites: await db.meals.count(), staples: (await getStaples()).length }), [])
  // Body snapshot: latest weight with change over ~30 days, top PRs, last run.
  const body = useLiveQuery(async () => {
    const weights = (await db.measurements.where('metric').equals('weight').toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    const latest = weights[weights.length - 1]
    const monthAgo = addDays(today, -30)
    const base = [...weights].reverse().find((w) => w.date <= monthAgo) ?? weights[0]
    const lifts = await db.lifts.toArray()
    const pr = (k: string) => lifts.filter((l) => l.lift === k).reduce((m, l) => Math.max(m, l.value), 0)
    const runs = await db.runs.orderBy('date').reverse().first()
    return { latest, base, squat: pr('squat'), bench: pr('bench'), pullups: pr('pullups'), lastRun: runs }
  }, [today])
  const closet = useLiveQuery(async () => ({ items: await db.clothes.count(), outfits: await db.outfits.count() }), [])
  const openCloset = () => {
    try {
      sessionStorage.setItem(CLOSET_SECTION_KEY, 'maker')
    } catch {
      /* storage unavailable */
    }
    navigate('closet')
  }
  const openMeals = (section: string) => {
    try {
      sessionStorage.setItem(MEALS_SECTION_KEY, section)
    } catch {
      /* storage unavailable */
    }
    navigate('meals')
  }

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

      {body && (body.latest || body.squat || body.bench || body.pullups || body.lastRun) && (
        <button type="button" onClick={() => navigate('body')} className="card block w-full text-left">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Body</h2>
            <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Log</span>
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
              <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Weight</dt>
              <dd className="font-semibold tabular-nums">{body.latest ? `${fmtNum(body.latest.value)}` : '—'}</dd>
              {body.latest && body.base && body.base !== body.latest && (
                <dd className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                  {body.latest.value - body.base.value >= 0 ? '+' : ''}
                  {fmtNum(body.latest.value - body.base.value)} lbs
                </dd>
              )}
            </div>
            <div className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
              <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Sq / Bench</dt>
              <dd className="font-semibold tabular-nums">{body.squat || body.bench ? `${body.squat || '—'} / ${body.bench || '—'}` : '—'}</dd>
              {!!body.pullups && <dd className="text-[11px] text-slate-500 dark:text-slate-400">{body.pullups} pull-ups</dd>}
            </div>
            <div className="rounded-xl bg-slate-50 py-2 dark:bg-slate-800/60">
              <dt className="text-[11px] text-slate-500 uppercase dark:text-slate-400">Last run</dt>
              <dd className="font-semibold">{body.lastRun ? friendlyDate(body.lastRun.date) : '—'}</dd>
              {body.lastRun && <dd className="text-[11px] text-slate-500 dark:text-slate-400">{fmtNum(body.lastRun.distanceMi, 2)} mi</dd>}
            </div>
          </dl>
        </button>
      )}

      <button type="button" onClick={() => openMeals('maker')} className="card block w-full text-left">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">✦ What should I cook?</h2>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Meal Maker</span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {meals
            ? `Recipes from your ${meals.staples} staple${meals.staples === 1 ? '' : 's'} and preferences · ${meals.favorites} favorite${meals.favorites === 1 ? '' : 's'} saved`
            : ' '}
        </p>
      </button>

      <button type="button" onClick={openCloset} className="card block w-full text-left">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">✦ What should I wear?</h2>
          <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Outfit Maker</span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {closet
            ? closet.items
              ? `${closet.items} item${closet.items === 1 ? '' : 's'} in your closet · ${closet.outfits} saved outfit${closet.outfits === 1 ? '' : 's'}`
              : 'Add your clothes to get outfit ideas'
            : ' '}
        </p>
      </button>
    </div>
  )
}
