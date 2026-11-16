import { db, setSetting } from './db'

/**
 * Backup = one JSON file with every table. Blobs (clothing photos, added in a
 * later phase) are stored as data URLs so the file restores on its own.
 * The Gemini API key is deliberately left out so backups are safe to keep in iCloud.
 */

const FORMAT = 'ledger-backup'
const EXCLUDED_SETTINGS = new Set(['geminiApiKey'])

interface BackupFile {
  format: typeof FORMAT
  version: number
  exportedAt: string
  tables: Record<string, unknown[]>
}

const BLOB_TAG = '__blob__'

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { [BLOB_TAG]: await blobToDataUrl(value) }
  if (Array.isArray(value)) return Promise.all(value.map(encode))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await encode(v)
    return out
  }
  return value
}

async function decode(value: unknown): Promise<unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value) && BLOB_TAG in value) {
    return (await fetch((value as Record<string, string>)[BLOB_TAG])).blob()
  }
  if (Array.isArray(value)) return Promise.all(value.map(decode))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = await decode(v)
    return out
  }
  return value
}

export async function exportBackup(): Promise<{ file: File; counts: Record<string, number> }> {
  const tables: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  for (const table of db.tables) {
    let rows = await table.toArray()
    if (table.name === 'settings') rows = rows.filter((r) => !EXCLUDED_SETTINGS.has(r.key))
    tables[table.name] = (await encode(rows)) as unknown[]
    counts[table.name] = rows.length
  }
  const backup: BackupFile = { format: FORMAT, version: db.verno, exportedAt: new Date().toISOString(), tables }
  const stamp = new Date().toISOString().slice(0, 10)
  const file = new File([JSON.stringify(backup)], `ledger-backup-${stamp}.json`, { type: 'application/json' })
  return { file, counts }
}

/** Saves the file: share sheet on iPhone (Save to Files / iCloud), download elsewhere. */
export async function saveBackupFile(file: File): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // fall through to a normal download
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/** Replaces all app data with the backup's contents. The API key on this device is kept. */
export async function importBackup(file: File): Promise<Record<string, number>> {
  const parsed = JSON.parse(await file.text()) as BackupFile
  if (parsed?.format !== FORMAT || typeof parsed.tables !== 'object') {
    throw new Error('That file is not a Ledger backup.')
  }
  if (parsed.version > db.verno) {
    throw new Error('This backup is from a newer version of the app. Update the app first.')
  }

  const decoded: Record<string, unknown[]> = {}
  for (const [name, rows] of Object.entries(parsed.tables)) {
    decoded[name] = (await decode(rows)) as unknown[]
  }

  const counts: Record<string, number> = {}
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = decoded[table.name] ?? []
      if (table.name === 'settings') {
        // Keep this device's excluded settings (the API key), replace the rest.
        const keep = (await table.toArray()).filter((r) => EXCLUDED_SETTINGS.has(r.key))
        await table.clear()
        await table.bulkPut([...keep, ...rows.filter((r) => !EXCLUDED_SETTINGS.has((r as { key: string }).key))])
      } else {
        await table.clear()
        await table.bulkPut(rows)
      }
      counts[table.name] = rows.length
    }
  })
  await setSetting('lastImportAt', Date.now())
  return counts
}
