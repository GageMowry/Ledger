import Dexie, { type EntityTable } from 'dexie'

/**
 * Everything the app stores lives in this IndexedDB database on the device.
 * New feature tables get added in later schema versions (db.version(2)...).
 */

export interface Setting {
  key: string
  value: unknown
}

export interface Task {
  id: number
  title: string
  notes?: string
  dueDate?: string // YYYY-MM-DD
  priority: 'low' | 'normal' | 'high'
  category?: string
  done: boolean
  createdAt: number
  completedAt?: number
}

export class LedgerDB extends Dexie {
  settings!: EntityTable<Setting, 'key'>
  tasks!: EntityTable<Task, 'id'>

  constructor() {
    super('ledger')
    this.version(1).stores({
      settings: 'key',
      tasks: '++id, done, dueDate, priority, category, createdAt',
    })
  }
}

export const db = new LedgerDB()

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}

/** Ask the browser not to evict our data when storage is low. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
