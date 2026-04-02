import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { zipSync } from 'fflate'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../../utils/constants'

type Photo = {
  name: string
  url: string
}

const getPhotos = createServerFn({ method: 'GET' }).handler(async (ctx) => {
  const { eventId } = ctx.data as { eventId: string }
  const admin = getSupabaseAdminClient()
  const folder = `events/${eventId}/photos`
  const { data, error } = await admin.storage
    .from(SUPABASE_BUCKET)
    .list(folder, { sortBy: { column: 'created_at', order: 'desc' } })
  if (error) throw new Error(error.message)

  return data.map((f) => {
    const { data: urlData } = admin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(`${folder}/${f.name}`)
    return { name: f.name, url: urlData.publicUrl } satisfies Photo
  })
})

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/photos',
)({
  loader: async ({ params }) =>
    await getPhotos({ data: { eventId: params.eventId } }),
  component: PhotoGalleryPage,
})

async function downloadAll(photos: Array<Photo>, eventId: string) {
  const entries: Record<string, Uint8Array> = {}
  await Promise.all(
    photos.map(async (photo) => {
      const res = await fetch(photo.url)
      const buf = await res.arrayBuffer()
      entries[photo.name] = new Uint8Array(buf)
    }),
  )
  const zipped = zipSync(entries)
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `photos-${eventId}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

function PhotoGalleryPage() {
  const photos = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const [zipping, setZipping] = useState(false)

  const handleDownloadAll = async () => {
    setZipping(true)
    try {
      await downloadAll(photos, eventId)
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
            ({photos.length})
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
                <span className="text-xs text-white font-medium">Download</span>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
