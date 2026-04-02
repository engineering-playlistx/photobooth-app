import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { zipSync } from 'fflate'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../../utils/constants'

// Grid-friendly: 4 columns × 12 rows
const PAGE_SIZE = 48

type Photo = {
  name: string
  url: string
}

const getPhotos = createServerFn({ method: 'GET' }).handler(async (ctx) => {
  const { eventId, page = 1 } = ctx.data as { eventId: string; page?: number }
  const admin = getSupabaseAdminClient()
  const folder = `events/${eventId}/photos`

  // Fetch all file metadata server-side (names + metadata only, no image data).
  // Storage .list() has no built-in count/range — we paginate the metadata slice here.
  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .list(folder, { sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error(error.message)

  const allFiles = data
  const totalCount = allFiles.length
  const from = (page - 1) * PAGE_SIZE
  const pageFiles = allFiles.slice(from, from + PAGE_SIZE)

  const photos = pageFiles.map((f) => {
    const { data: urlData } = admin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(`${folder}/${f.name}`)
    return { name: f.name, url: urlData.publicUrl } satisfies Photo
  })

  return { photos, totalCount }
})

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/photos',
)({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
  }),
  loaderDeps: ({ search: { page } }) => ({ page }),
  loader: async ({ params, deps: { page } }) =>
    await getPhotos({ data: { eventId: params.eventId, page } }),
  component: PhotoGalleryPage,
})

// Cloudflare Workers memory limit: ~128MB. Cap at 25 photos (~2MB each = ~50MB).
// If the event has more photos, instruct the operator to use the download-photos script.
const ZIP_PHOTO_LIMIT = 25

const downloadPhotosZip = createServerFn({ method: 'GET' }).handler(
  async (ctx) => {
    const { eventId } = ctx.data as { eventId: string }
    const admin = getSupabaseAdminClient()
    const folder = `events/${eventId}/photos`

    const { data, error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .list(folder, { sortBy: { column: 'created_at', order: 'desc' } })
    if (error) throw new Error(error.message)

    const allFiles = data
    if (allFiles.length > ZIP_PHOTO_LIMIT) {
      return {
        tooLarge: true as const,
        count: allFiles.length,
        zipBase64: null,
      }
    }

    const entries: Record<string, Uint8Array> = {}
    await Promise.all(
      allFiles.map(async (f) => {
        const { data: blob, error: dlErr } = await admin.storage
          .from(SUPABASE_BUCKET)
          .download(`${folder}/${f.name}`)
        if (dlErr) return
        const buf = await blob.arrayBuffer()
        entries[f.name] = new Uint8Array(buf)
      }),
    )

    const zipped = zipSync(entries)
    const zipBase64 = Buffer.from(zipped).toString('base64')
    return { tooLarge: false as const, count: allFiles.length, zipBase64 }
  },
)

function PhotoGalleryPage() {
  const { photos, totalCount } = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const { page } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [zipping, setZipping] = useState(false)

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const goToPage = (p: number) =>
    navigate({ search: (prev) => ({ ...prev, page: p }) })

  const handleDownloadAll = async () => {
    setZipping(true)
    try {
      const result = await downloadPhotosZip({ data: { eventId } })
      if (result.tooLarge) {
        alert(
          `This event has ${result.count} photos. ZIP download is limited to ${ZIP_PHOTO_LIMIT} photos to avoid memory issues.\n\nUse the download-photos script to bulk-download all photos.`,
        )
        return
      }
      const binary = atob(result.zipBase64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/zip' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `photos-${eventId}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setZipping(false)
    }
  }

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
        <span className="text-sm text-white">Photos</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Photos{' '}
          <span className="text-base font-normal text-slate-400">
            ({totalCount}) — Page {page} of {totalPages}
          </span>
        </h1>
        {photos.length > 0 && (
          <button
            onClick={handleDownloadAll}
            disabled={zipping}
            className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {zipping ? 'Zipping…' : 'Download All'}
          </button>
        )}
      </div>

      {photos.length === 0 ? (
        <p className="text-slate-400">No photos yet for this event.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo) => (
              <a
                key={photo.name}
                href={photo.url}
                download={photo.name}
                target="_blank"
                rel="noreferrer"
                className="group relative aspect-[9/16] bg-slate-800 rounded-lg overflow-hidden border border-slate-700 hover:border-slate-500 transition-colors"
              >
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="text-xs text-white font-medium">
                    Download
                  </span>
                </div>
              </a>
            ))}
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
