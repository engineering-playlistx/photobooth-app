import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'

type Event = {
  id: string
  name: string
  status: string
  created_at: string
}

const getEvents = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('events')
    .select('id, name, status, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Array<Event>
})

export const Route = createFileRoute('/dashboard/_layout/')({
  loader: async () => await getEvents(),
  component: EventListPage,
})

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  draft: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  ended: 'bg-slate-700/40 text-slate-500 border-slate-700/40',
}

function EventListPage() {
  const events = Route.useLoaderData()

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Events</h1>
      {events.length === 0 ? (
        <p className="text-slate-400">No events found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {events.map((event) => (
                <tr
                  key={event.id}
                  className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {event.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 text-xs rounded-full border ${STATUS_STYLES[event.status]}`}
                    >
                      {event.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(event.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/dashboard/events/$eventId"
                      params={{ eventId: event.id }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
