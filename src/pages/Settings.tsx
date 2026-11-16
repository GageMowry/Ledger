import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../db'
import { MODEL_RULES, getSearchUsage, listModels, pickModel, resolveModels } from '../gemini'
import { exportBackup, importBackup, saveBackupFile } from '../backup'

type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null

function StatusLine({ status }: { status: Status }) {
  if (!status) return null
  const color =
    status.kind === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : status.kind === 'error'
        ? 'text-rose-600 dark:text-rose-400'
        : 'text-slate-500 dark:text-slate-400'
  return <p className={`mt-3 text-sm ${color}`}>{status.text}</p>
}

function formatCounts(counts: Record<string, number>) {
  return Object.entries(counts)
    .filter(([name]) => name !== 'settings')
    .map(([name, n]) => `${n} ${name}`)
    .join(', ')
}

function GeminiSection() {
  const savedKey = useLiveQuery(() => getSetting<string>('geminiApiKey', ''), [], undefined)
  const resolved = useLiveQuery(() => getSetting<{ lite: string; search: string } | null>('resolvedModels', null), [])
  const usage = useLiveQuery(getSearchUsage, [])
  const [keyInput, setKeyInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  async function check(apiKey: string) {
    setBusy(true)
    setStatus({ kind: 'info', text: 'Checking key…' })
    try {
      const ids = (await listModels(apiKey)).map((m) => m.id)
      const lite = pickModel('lite', ids)
      const search = pickModel('search', ids)
      const missing = [!lite && MODEL_RULES.lite.label, !search && MODEL_RULES.search.label].filter(Boolean)
      setStatus(
        missing.length
          ? { kind: 'error', text: `Key works, but ${missing.join(' and ')} isn't available on it yet.` }
          : { kind: 'ok', text: `Key works. Using ${lite} and ${search}.` },
      )
      return true
    } catch (e) {
      setStatus({ kind: 'error', text: `Key check failed: ${(e as Error).message}` })
      return false
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    const key = keyInput.trim()
    if (!key) return
    if (await check(key)) {
      await setSetting('geminiApiKey', key)
      await resolveModels(true)
      setKeyInput('')
    }
  }

  async function remove() {
    await db.settings.bulkDelete(['geminiApiKey', 'resolvedModels'])
    setStatus({ kind: 'info', text: 'Key removed from this device.' })
  }

  return (
    <section className="card">
      <h2 className="font-semibold">Gemini AI</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Your key is stored only on this device and is never included in backups. Get one at
        aistudio.google.com.
      </p>

      {savedKey ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm dark:bg-slate-800">
            ••••{savedKey.slice(-4)}
          </span>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => check(savedKey)}>
            Test key
          </button>
          <button type="button" className="btn-secondary" onClick={remove}>
            Remove
          </button>
        </div>
      ) : (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <input
            className="field"
            type="password"
            autoComplete="off"
            placeholder="Paste API key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0" disabled={busy || !keyInput.trim()}>
            Save
          </button>
        </form>
      )}

      <h3 className="mt-5 text-xs font-semibold tracking-wide text-slate-500 uppercase">Models</h3>
      <dl className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
        <div className="flex items-start justify-between gap-3 py-2">
          <dt>
            <p className="font-medium">All tasks</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Makers, descriptions, photo tagging</p>
          </dt>
          <dd className="text-right">
            <p className="whitespace-nowrap">{MODEL_RULES.lite.label}</p>
            {resolved?.lite && <p className="font-mono text-[11px] text-slate-400">{resolved.lite}</p>}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3 py-2">
          <dt>
            <p className="font-medium">Web search</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Only when Web is on in a Maker</p>
          </dt>
          <dd className="text-right">
            <p className="whitespace-nowrap">{MODEL_RULES.search.label}</p>
            {resolved?.search && <p className="font-mono text-[11px] text-slate-400">{resolved.search}</p>}
            {usage && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {usage.used} of {usage.limit} used today
              </p>
            )}
          </dd>
        </div>
      </dl>

      <StatusLine status={status} />
    </section>
  )
}

function BackupSection() {
  const lastBackupAt = useLiveQuery(() => getSetting<number | null>('lastBackupAt', null), [], null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function doExport() {
    setBusy(true)
    try {
      const { file, counts } = await exportBackup()
      const result = await saveBackupFile(file)
      if (result === 'cancelled') {
        setStatus({ kind: 'info', text: 'Backup cancelled.' })
      } else {
        await setSetting('lastBackupAt', Date.now())
        setStatus({ kind: 'ok', text: `Backup saved (${formatCounts(counts) || 'no data yet'}).` })
      }
    } catch (e) {
      setStatus({ kind: 'error', text: `Backup failed: ${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  async function doImport(file: File) {
    if (!confirm('Restoring replaces ALL data in the app with the backup. Continue?')) return
    setBusy(true)
    try {
      const counts = await importBackup(file)
      setStatus({ kind: 'ok', text: `Restored ${formatCounts(counts) || 'an empty backup'}.` })
    } catch (e) {
      setStatus({ kind: 'error', text: `Restore failed: ${(e as Error).message}` })
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="card">
      <h2 className="font-semibold">Backup</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        All your data lives only on this device. Export a backup regularly and save it to Files or
        iCloud Drive.
      </p>
      <p className="mt-2 text-sm">
        Last backup:{' '}
        <span className="font-medium">{lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'never'}</span>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={busy} onClick={doExport}>
          Export backup
        </button>
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
          Restore from file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doImport(f)
          }}
        />
      </div>
      <StatusLine status={status} />
    </section>
  )
}

function StorageSection() {
  const [info, setInfo] = useState<{ persisted: boolean; usage?: number; quota?: number } | null>(null)

  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false
      const est = await navigator.storage?.estimate?.()
      setInfo({ persisted, usage: est?.usage, quota: est?.quota })
    })()
  }, [])

  const mb = (n?: number) => (n === undefined ? '?' : `${(n / 1024 / 1024).toFixed(1)} MB`)

  return (
    <section className="card">
      <h2 className="font-semibold">Storage</h2>
      {info ? (
        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>Used: {mb(info.usage)}{info.quota ? ` of ${mb(info.quota)} available` : ''}</li>
          <li>Protected from automatic clearing: {info.persisted ? 'yes' : 'not confirmed'}</li>
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">Checking…</p>
      )}
    </section>
  )
}

export default function Settings() {
  return (
    <div className="space-y-4">
      <GeminiSection />
      <BackupSection />
      <StorageSection />
      <p className="text-center text-xs text-slate-400">Ledger v{__APP_VERSION__}</p>
    </div>
  )
}
