import type { Task } from '../db'
import { friendlyDate } from '../dates'
import { isOverdue, toggleDone } from '../tasks'

export default function TaskRow({ task, onOpen }: { task: Task; onOpen: (t: Task) => void }) {
  const overdue = isOverdue(task)

  return (
    <li className="flex items-start gap-3 py-3">
      <button
        type="button"
        onClick={() => void toggleDone(task)}
        aria-label={task.done ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition ${
          task.done
            ? 'border-indigo-600 bg-indigo-600 text-white'
            : task.priority === 'high'
              ? 'border-rose-500'
              : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {task.done && (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden="true">
            <path d="m5 12 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <p className={`break-words ${task.done ? 'text-slate-400 line-through' : ''}`}>{task.title}</p>
        {(task.dueDate || task.category || task.notes || task.priority !== 'normal') && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
            {task.dueDate && (
              <span className={overdue ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>
                {overdue ? 'Overdue · ' : ''}
                {friendlyDate(task.dueDate)}
              </span>
            )}
            {task.priority === 'high' && !task.done && <span className="text-rose-600 dark:text-rose-400">High</span>}
            {task.priority === 'low' && <span>Low</span>}
            {task.category && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">{task.category}</span>
            )}
            {task.notes && <span aria-label="Has notes">📝</span>}
          </p>
        )}
      </button>
    </li>
  )
}
