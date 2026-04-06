import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'

type DailyTrendEntry = { date: string; visits: number }

type EventAnalytics = {
  total_visits: number
  unique_guests: number
  returning_guests: number
  daily_trend: Array<DailyTrendEntry>
}

function buildLast30Days(): Array<string> {
  const days: Array<string> = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

const getEventAnalytics = createServerFn({ method: 'GET' }).handler(
  async (ctx) => {
    const { eventId } = ctx.data as { eventId: string }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin.rpc('get_event_analytics', {
      p_event_id: eventId,
    })
    if (error) throw new Error(error.message)

    const raw = (data ?? {}) as Partial<EventAnalytics>
    const dbTrend: Array<DailyTrendEntry> = raw.daily_trend ?? []
    const trendMap = new Map(dbTrend.map((d) => [d.date, d.visits]))

    const daily_trend = buildLast30Days().map((date) => ({
      date,
      visits: trendMap.get(date) ?? 0,
    }))

    return {
      total_visits: raw.total_visits ?? 0,
      unique_guests: raw.unique_guests ?? 0,
      returning_guests: raw.returning_guests ?? 0,
      daily_trend,
    } satisfies EventAnalytics
  },
)

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/analytics',
)({
  loader: async ({ params }) =>
    await getEventAnalytics({ data: { eventId: params.eventId } }),
  component: AnalyticsPage,
})

function AnalyticsPage() {
  const analytics = Route.useLoaderData()
  const { eventId } = Route.useParams()

  const maxVisits = Math.max(1, ...analytics.daily_trend.map((d) => d.visits))

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/dashboard/events/$eventId"
          params={{ eventId }}
          className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← {eventId}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-white">Analytics</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Visits" value={String(analytics.total_visits)} />
        <StatCard
          label="Unique Guests"
          value={String(analytics.unique_guests)}
        />
        <StatCard
          label="Returning Guests"
          value={String(analytics.returning_guests)}
        />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-sm font-medium text-slate-400 mb-6">
          Daily Visits — Last 30 Days
        </h2>
        <div className="flex items-end gap-1 h-40">
          {analytics.daily_trend.map((day) => {
            const heightPct =
              day.visits === 0 ? 0 : Math.max(4, (day.visits / maxVisits) * 100)
            const shortDate = day.date.slice(5) // MM-DD
            return (
              <div
                key={day.date}
                className="flex flex-col items-center flex-1 min-w-0 gap-1 group"
                title={`${day.date}: ${day.visits} visit${day.visits === 1 ? '' : 's'}`}
              >
                <span className="text-xs text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  {day.visits}
                </span>
                <div
                  className="w-full flex items-end"
                  style={{ height: '120px' }}
                >
                  <div
                    className="w-full bg-indigo-500 rounded-t transition-all"
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="text-slate-600 text-[10px] rotate-90 origin-left translate-x-2 hidden sm:block">
                  {shortDate}
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between mt-6 text-xs text-slate-500">
          <span>{analytics.daily_trend[0]?.date ?? ''}</span>
          <span>
            {analytics.daily_trend[analytics.daily_trend.length - 1]?.date ??
              ''}
          </span>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  )
}
