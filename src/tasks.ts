import { db, type Task } from './db'
import { todayISO } from './dates'

export type TaskInput = Pick<Task, 'title' | 'notes' | 'dueDate' | 'priority' | 'category'>

const PRIORITY_RANK: Record<Task['priority'], number> = { high: 0, normal: 1, low: 2 }

export function isOverdue(t: Task): boolean {
  return !t.done && !!t.dueDate && t.dueDate < todayISO()
}

/** Open tasks: by due date (no date last), then priority, then oldest first. */
export function compareOpen(a: Task, b: Task): number {
  const ad = a.dueDate ?? '9999-99-99'
  const bd = b.dueDate ?? '9999-99-99'
  if (ad !== bd) return ad < bd ? -1 : 1
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (p !== 0) return p
  return a.createdAt - b.createdAt
}

function clean(input: TaskInput): TaskInput {
  return {
    title: input.title.trim(),
    notes: input.notes?.trim() || undefined,
    dueDate: input.dueDate || undefined,
    priority: input.priority,
    category: input.category?.trim() || undefined,
  }
}

export async function addTask(input: TaskInput): Promise<void> {
  await db.tasks.add({ ...clean(input), done: false, createdAt: Date.now() } as Task)
}

export async function updateTask(id: number, input: TaskInput): Promise<void> {
  const c = clean(input)
  // Dexie deletes a property when its new value is undefined, which clears removed fields.
  await db.tasks.update(id, {
    title: c.title,
    priority: c.priority,
    notes: c.notes,
    dueDate: c.dueDate,
    category: c.category,
  })
}

export async function toggleDone(t: Task): Promise<void> {
  await db.tasks.update(t.id, t.done ? { done: false, completedAt: undefined } : { done: true, completedAt: Date.now() })
}

export async function deleteTask(id: number): Promise<void> {
  await db.tasks.delete(id)
}

export async function clearCompleted(): Promise<number> {
  return db.tasks.filter((t) => t.done).delete()
}
