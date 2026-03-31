import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/_layout/')({
  component: DashboardIndex,
})

function DashboardIndex() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Dashboard</h1>
      <p className="text-slate-400 mt-2">Event management coming soon.</p>
    </div>
  )
}
