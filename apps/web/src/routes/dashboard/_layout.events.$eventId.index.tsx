import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'

type EventDetail = {
  id: string
  name: string
  status: string
  created_at: string
  guestCount: number
}

const getEventDetail = createServerFn({ method: 'GET' }).handler(
  async (ctx) => {
    const { eventId } = ctx.data as { eventId: string }
    const admin = getSupabaseAdminClient()
    const [{ data: event, error }, { count }] = await Promise.all([
      admin
        .from('events')
        .select('id, name, status, created_at')
        .eq('id', eventId)
        .single(),
      admin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId),
    ])
    if (error) throw new Error(error.message)
    return {
      ...(event as Omit<EventDetail, 'guestCount'>),
      guestCount: count ?? 0,
    }
  },
)

export const Route = createFileRoute('/dashboard/_layout/events/$eventId/')({
  loader: async ({ params }) =>
    await getEventDetail({ data: { eventId: params.eventId } }),
  component: EventDetailPage,
})

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  ended: 'bg-slate-700/40 text-slate-500 border-slate-700/40',
}

function EventDetailPage() {
  const event = Route.useLoaderData()

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/dashboard"
          className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← Events
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-white">{event.name}</span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">{event.name}</h1>
        <span
          className={`inline-flex px-2.5 py-1 text-xs rounded-full border ${STATUS_STYLES[event.status]}`}
        >
          {event.status}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Guests" value={String(event.guestCount)} />
        <StatCard label="Event ID" value={event.id} mono />
        <StatCard
          label="Created"
          value={new Date(event.created_at).toLocaleDateString()}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          to="/dashboard/events/$eventId/guests"
          params={{ eventId: event.id }}
          className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
        >
          <div>
            <p className="font-medium text-white">Guests</p>
            <p className="text-sm text-slate-400 mt-0.5">
              View list and export CSV
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            →
          </span>
        </Link>
        <Link
          to="/dashboard/events/$eventId/photos"
          params={{ eventId: event.id }}
          className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
        >
          <div>
            <p className="font-medium text-white">Photos</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Gallery and bulk download
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            →
          </span>
        </Link>
        <Link
          to="/dashboard/events/$eventId/config"
          params={{ eventId: event.id }}
          className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
        >
          <div>
            <p className="font-medium text-white">Config</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Edit branding, form fields, and tech settings
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            →
          </span>
        </Link>
        <Link
          to="/dashboard/events/$eventId/flow"
          params={{ eventId: event.id }}
          className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
        >
          <div>
            <p className="font-medium text-white">Flow Builder</p>
            <p className="text-sm text-slate-400 mt-0.5">
              View and configure the kiosk module pipeline
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            →
          </span>
        </Link>
        <Link
          to="/dashboard/events/$eventId/analytics"
          params={{ eventId: event.id }}
          className="flex items-center justify-between p-4 bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-lg transition-colors group"
        >
          <div>
            <p className="font-medium text-white">Analytics</p>
            <p className="text-sm text-slate-400 mt-0.5">
              Visits, unique guests, and daily trend
            </p>
          </div>
          <span className="text-slate-500 group-hover:text-slate-300 transition-colors">
            →
          </span>
        </Link>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p
        className={`text-lg font-semibold text-white truncate ${mono ? 'font-mono text-sm' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}
