import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../../utils/constants'

const PAGE_SIZE = 50

type Guest = {
  name: string
  email: string
  phone: string
  selected_theme: string
  created_at: string
  photo_path: string | null
  photo_url: string | null
}

const getGuests = createServerFn({ method: 'GET' }).handler(async (ctx) => {
  const { eventId, page = 1 } = ctx.data as { eventId: string; page?: number }
  const admin = getSupabaseAdminClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  const { data, error, count } = await admin
    .from('users')
    .select('name, email, phone, selected_theme, created_at, photo_path', {
      count: 'exact',
    })
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (error) throw new Error(error.message)

  const guests = data.map((g) => {
    const photo_url = g.photo_path
      ? admin.storage.from(SUPABASE_BUCKET).getPublicUrl(g.photo_path as string)
          .data.publicUrl
      : null
    return { ...g, photo_url } as Guest
  })

  return { guests, totalCount: count ?? 0 }
})

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/guests',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
  loaderDeps: ({ search: { page } }) => ({ page }),
  loader: async ({ params, deps: { page } }) =>
    await getGuests({ data: { eventId: params.eventId, page } }),
  component: GuestListPage,
})

function photoFilename(path: string | null): string {
  if (!path) return '—'
  return path.split('/').pop() ?? path
}

function sanitizeCsvCell(val: string | null): string {
  const s = String(val ?? '')
  return /^[=+\-@|]/.test(s) ? `'${s}` : s
}

function downloadCSV(guests: Array<Guest>, eventId: string) {
  const headers = ['Name', 'Email', 'Phone', 'Theme', 'Timestamp', 'Photo File']
  const rows = guests.map((g) => [
    g.name,
    g.email,
    g.phone,
    g.selected_theme,
    new Date(g.created_at).toISOString(),
    photoFilename(g.photo_path),
  ])
  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `guests-${eventId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function GuestListPage() {
  const { guests, totalCount } = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const goToPage = (p: number) =>
    navigate({ search: (prev) => ({ ...prev, page: p }) })

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
        <span className="text-sm text-white">Guests</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Guests{' '}
          <span className="text-base font-normal text-slate-400">
            ({totalCount}) — Page {page} of {totalPages}
          </span>
        </h1>
        {guests.length > 0 && (
          <button
            onClick={() => downloadCSV(guests, eventId)}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>

      {guests.length === 0 ? (
        <p className="text-slate-400">No guests yet for this event.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="w-full text-sm">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Photo
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Theme
                  </th>
                  <th className="px-4 py-3 text-left text-slate-400 font-medium">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {guests.map((guest, i) => (
                  <tr
                    key={i}
                    className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {guest.photo_url ? (
                        <a
                          href={guest.photo_url}
                          target="_blank"
                          rel="noreferrer"
                          title={photoFilename(guest.photo_path)}
                          className="block w-8 shrink-0"
                        >
                          <img
                            src={guest.photo_url}
                            alt={guest.name}
                            className="w-8 aspect-[9/16] object-cover rounded hover:opacity-80 transition-opacity"
                            loading="lazy"
                          />
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">{guest.name}</td>
                    <td className="px-4 py-3 text-slate-300">{guest.email}</td>
                    <td className="px-4 py-3 text-slate-300">{guest.phone}</td>
                    <td className="px-4 py-3 text-slate-300 capitalize">
                      {guest.selected_theme}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(guest.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
