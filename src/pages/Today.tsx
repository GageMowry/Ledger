import { useLiveQuery } from 'dexie-react-hooks'
import { getSetting } from '../db'
import { navigate } from '../router'

const DAY = 24 * 60 * 60 * 1000

export default function Today() {
  const lastBackupAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [], null)
  const hasKey = useLiveQuery(async () => !!(await getSetting<string>('geminiApiKey', '')), [], true)

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

      <div className="card">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Your daily summary of tasks, meals and outfit ideas will show up here as each section is built.
        </p>
      </div>
    </div>
  )
}
