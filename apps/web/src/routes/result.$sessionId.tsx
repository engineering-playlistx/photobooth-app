import React, { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../utils/constants'
import type { BrandingConfig } from '@photobooth/types'

type SessionPageData = {
  photoUrl: string
  guestName: string
  branding: BrandingConfig
}

const getSessionData = createServerFn({ method: 'GET' }).handler(
  async (ctx) => {
    const { sessionId } = ctx.data as { sessionId: string }
    const admin = getSupabaseAdminClient()

    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      throw new Error('Session not found')
    }

    const {
      data: { publicUrl: photoUrl },
    } = admin.storage.from(SUPABASE_BUCKET).getPublicUrl(session.photo_path)

    const { data: eventConfig } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', session.event_id)
      .single()

    const branding: BrandingConfig = {
      logoUrl: null,
      primaryColor: '#ffc600',
      secondaryColor: '#dd1d21',
      fontFamily: null,
      backgroundUrl: null,
      portalHeading: null,
      ...(eventConfig?.config_json?.branding ?? {}),
    }

    const userInfo = session.user_info as { name: string } | null
    const guestName = userInfo?.name ?? 'Racer'

    return { photoUrl, guestName, branding } satisfies SessionPageData
  },
)

export const Route = createFileRoute('/result/$sessionId')({
  loader: async ({ params }) => {
    try {
      return await getSessionData({ data: { sessionId: params.sessionId } })
    } catch {
      return null
    }
  },
  component: GuestPortalPage,
})

async function triggerBlobDownload(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to fetch photo')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  a.click()
  URL.revokeObjectURL(objectUrl)
}

function GuestPortalPage() {
  const data = Route.useLoaderData()
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white p-6">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">Photo not found</p>
          <p className="text-gray-400 text-sm">
            This link may have expired or is invalid.
          </p>
        </div>
      </div>
    )
  }

  const { photoUrl, guestName, branding } = data

  return (
    <div
      className="min-h-screen flex flex-col items-center px-4 py-10"
      style={{ backgroundColor: branding.secondaryColor }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        {branding.logoUrl && (
          <img
            src={branding.logoUrl}
            alt="Event logo"
            className="h-12 object-contain"
          />
        )}

        <div className="text-center">
          {branding.portalHeading && (
            <p
              className="text-3xl font-black"
              style={{ color: branding.primaryColor }}
            >
              {branding.portalHeading}
            </p>
          )}
          <p className="text-3xl font-black text-white">{guestName}!</p>
        </div>

        <img
          src={photoUrl}
          alt="Your photo"
          className="w-full rounded-2xl shadow-2xl border border-white/10"
        />

        <button
          type="button"
          disabled={downloading}
          onClick={() => {
            setDownloading(true)
            setDownloadError(null)
            triggerBlobDownload(photoUrl, `${guestName}-photo.jpg`)
              .catch(() =>
                setDownloadError('Download failed. Please try again.'),
              )
              .finally(() => setDownloading(false))
          }}
          className="w-full text-center py-4 rounded-xl text-lg font-bold transition-opacity hover:opacity-90 active:opacity-75 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: branding.primaryColor,
            color: branding.secondaryColor,
          }}
        >
          {downloading ? 'Downloading…' : 'Download Photo'}
        </button>
        {downloadError && (
          <p className="text-red-400 text-sm text-center">{downloadError}</p>
        )}
      </div>
    </div>
  )
}
