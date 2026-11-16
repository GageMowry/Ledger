import { useCallback, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Task } from '../db'
import { addDays, todayISO } from '../dates'
import { addTask, clearCompleted, compareOpen, deleteTask, updateTask } from '../tasks'
import Sheet from '../components/Sheet'
import TaskForm from '../components/TaskForm'
import TaskRow from '../components/TaskRow'

type Filter = 'open' | 'today' | 'upcoming' | 'done'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'All open' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'done', label: 'Done' },
]

export default function Tasks() {
  const loaded = useLiveQuery(() => db.tasks.toArray(), [])
  const tasks = useMemo<Task[]>(() => loaded ?? [], [loaded])
  const [filter, setFilter] = useState<Filter>('open')
  const [category, setCategory] = useState<string | null>(null)
  const [quick, setQuick] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [adding, setAdding] = useState(false)

  const categories = useMemo(
    () => [...new Set(tasks.map((t) => t.category).filter((c): c is string => !!c))].sort(),
    [tasks],
  )

  const visible = useMemo(() => {
    const today = todayISO()
    const weekOut = addDays(today, 7)
    let list = tasks.filter((t) => !category || t.category === category)
    switch (filter) {
      case 'open':
        list = list.filter((t) => !t.done)
        break
      case 'today':
        list = list.filter((t) => !t.done && !!t.dueDate && t.dueDate <= today)
        break
      case 'upcoming':
        list = list.filter((t) => !t.done && !!t.dueDate && t.dueDate > today && t.dueDate <= weekOut)
        break
      case 'done':
        return list.filter((t) => t.done).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    }
    return list.sort(compareOpen)
  }, [tasks, filter, category])

  const openCount = tasks.filter((t) => !t.done).length
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeAdd = useCallback(() => setAdding(false), [])

  async function quickAdd() {
    const title = quick.trim()
    if (!title) return
    // Quick-added tasks land in "Today" when that filter is showing, so they don't vanish.
    await addTask({ title, priority: 'normal', dueDate: filter === 'today' ? todayISO() : undefined, category: category ?? undefined })
    setQuick('')
  }

  const emptyText: Record<Filter, string> = {
    open: 'Nothing open. Add something above.',
    today: 'Nothing due today.',
    upcoming: 'Nothing due in the next 7 days.',
    done: 'No completed tasks.',
  }

  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void quickAdd()
        }}
      >
        <input
          className="field"
          placeholder="Add a task"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          enterKeyHint="done"
        />
        <button type="button" className="btn-secondary shrink-0" onClick={() => setAdding(true)} aria-label="Add with details">
          Details
        </button>
      </form>

      <div className="chip-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === f.id
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
            }`}
          >
            {f.label}
            {f.id === 'open' && openCount > 0 ? ` · ${openCount}` : ''}
          </button>
        ))}
      </div>

      {categories.length > 0 && (
        <div className="chip-row">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? '__all'}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                category === c
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {c ?? 'All categories'}
            </button>
          ))}
        </div>
      )}

      <div className="card py-1">
        {visible.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {visible.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={setEditing} />
            ))}
          </ul>
        ) : loaded === undefined ? (
          <div className="h-16" />
        ) : (
          <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">{emptyText[filter]}</p>
        )}
      </div>

      {filter === 'done' && visible.length > 0 && (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => {
            if (confirm(`Delete all ${tasks.filter((t) => t.done).length} completed tasks?`)) void clearCompleted()
          }}
        >
          Clear completed
        </button>
      )}

      <Sheet open={adding} onClose={closeAdd} title="New task">
        <TaskForm
          categories={categories}
          initial={{ title: quick, category: category ?? undefined }}
          submitLabel="Add task"
          onSubmit={async (input) => {
            await addTask(input)
            setQuick('')
            setAdding(false)
          }}
        />
      </Sheet>

      <Sheet open={!!editing} onClose={closeEdit} title="Edit task">
        {editing && (
          <TaskForm
            key={editing.id}
            categories={categories}
            initial={editing}
            submitLabel="Save"
            onSubmit={async (input) => {
              await updateTask(editing.id, input)
              setEditing(null)
            }}
            onDelete={async () => {
              if (confirm('Delete this task?')) {
                await deleteTask(editing.id)
                setEditing(null)
              }
            }}
          />
        )}
      </Sheet>
    </div>
  )
}
