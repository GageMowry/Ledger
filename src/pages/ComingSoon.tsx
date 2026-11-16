export default function ComingSoon({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="card text-center">
      <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Phase {phase}</p>
      <p className="mt-1 text-slate-600 dark:text-slate-300">{what} will live here.</p>
    </div>
  )
}
