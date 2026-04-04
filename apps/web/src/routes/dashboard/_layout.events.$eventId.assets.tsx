import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../../utils/constants'
import type {
  AiGenerationModuleConfig,
  EventConfig,
  ThemeSelectionModuleConfig,
} from '@photobooth/types'

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const getEventConfig = createServerFn({ method: 'GET' }).handler(
  async (ctx) => {
    const { eventId } = ctx.data as { eventId: string }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()
    if (error) throw new Error(error.message)
    return data.config_json as EventConfig
  },
)

const saveEventConfig = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, config } = ctx.data as {
      eventId: string
      config: EventConfig
    }
    const admin = getSupabaseAdminClient()
    const { error } = await admin
      .from('event_configs')
      .update({ config_json: config, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
    if (error) throw new Error(error.message)
  },
)

const uploadAssetFn = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, assetType, filename, fileBase64, mimeType } = ctx.data as {
      eventId: string
      assetType: 'frames' | 'templates' | 'backgrounds' | 'logos'
      filename: string
      fileBase64: string
      mimeType: string
    }
    const admin = getSupabaseAdminClient()
    const uploadPath = `events/${eventId}/${assetType}/${filename}`
    const binary = atob(fileBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .upload(uploadPath, bytes, { contentType: mimeType, upsert: true })
    if (error) throw new Error(error.message)
    const { data } = admin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(uploadPath)
    return { publicUrl: data.publicUrl }
  },
)

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/assets',
)({
  loader: async ({ params }) =>
    await getEventConfig({ data: { eventId: params.eventId } }),
  component: AssetsPage,
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data URI prefix — only send the raw base64
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

// ---------------------------------------------------------------------------
// AssetSlot component
// ---------------------------------------------------------------------------

interface AssetSlotProps {
  label: string
  currentUrl: string | null | undefined
  onUpload: (file: File) => Promise<void>
}

function AssetSlot({ label, currentUrl, onUpload }: AssetSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
      <div className="w-16 h-16 shrink-0 bg-slate-800 rounded border border-slate-600 flex items-center justify-center overflow-hidden">
        {currentUrl?.startsWith('http') ? (
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-slate-600 text-xs text-center px-1 break-all">
            {currentUrl ?? 'Not set'}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-300 mb-1">{label}</p>
        {currentUrl && !currentUrl.startsWith('http') && (
          <p className="text-xs text-slate-500 truncate mb-1">{currentUrl}</p>
        )}
        {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
      </div>
      <div className="shrink-0">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleChange(e)
          }}
        />
        <button
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AssetsPage() {
  const { eventId } = Route.useParams()
  const initial = Route.useLoaderData()
  const [config, setConfig] = useState<EventConfig>(initial)

  const aiModule = config.moduleFlow.find(
    (m): m is AiGenerationModuleConfig => m.moduleId === 'ai-generation',
  )
  const tsModule = config.moduleFlow.find(
    (m): m is ThemeSelectionModuleConfig => m.moduleId === 'theme-selection',
  )

  async function persist(updated: EventConfig) {
    await saveEventConfig({ data: { eventId, config: updated } })
    setConfig(updated)
  }

  // --- Theme asset handlers ---

  function makeThemeUploader(
    themeId: string,
    field: 'frameImageUrl' | 'templateImageUrl' | 'previewImageUrl',
    assetType: 'frames' | 'templates',
  ) {
    return async (file: File) => {
      const fileBase64 = await readFileAsBase64(file)
      const filename = `${assetType === 'frames' ? 'frame' : 'template'}-${themeId}.png`
      const { publicUrl } = await uploadAssetFn({
        data: {
          eventId,
          assetType,
          filename,
          fileBase64,
          mimeType: file.type || 'image/png',
        },
      })

      const updated: EventConfig = {
        ...config,
        moduleFlow: config.moduleFlow.map((m) => {
          if (m.moduleId === 'ai-generation') {
            return {
              ...m,
              themes: m.themes.map((t) =>
                t.id === themeId ? { ...t, [field]: publicUrl } : t,
              ),
            }
          }
          // Also sync previewImageUrl into theme-selection module
          if (m.moduleId === 'theme-selection' && field === 'previewImageUrl') {
            return {
              ...m,
              themes: m.themes.map((t) =>
                t.id === themeId ? { ...t, previewImageUrl: publicUrl } : t,
              ),
            }
          }
          return m
        }),
      }
      await persist(updated)
    }
  }

  function makePreviewUploader(themeId: string) {
    return async (file: File) => {
      const fileBase64 = await readFileAsBase64(file)
      const { publicUrl } = await uploadAssetFn({
        data: {
          eventId,
          assetType: 'templates',
          filename: `preview-${themeId}.png`,
          fileBase64,
          mimeType: file.type || 'image/png',
        },
      })

      const updated: EventConfig = {
        ...config,
        moduleFlow: config.moduleFlow.map((m) => {
          if (m.moduleId === 'ai-generation') {
            return {
              ...m,
              themes: m.themes.map((t) =>
                t.id === themeId ? { ...t, previewImageUrl: publicUrl } : t,
              ),
            }
          }
          if (m.moduleId === 'theme-selection') {
            return {
              ...m,
              themes: m.themes.map((t) =>
                t.id === themeId ? { ...t, previewImageUrl: publicUrl } : t,
              ),
            }
          }
          return m
        }),
      }
      await persist(updated)
    }
  }

  // --- Background handler ---

  function makeBackgroundUploader(moduleId: string) {
    return async (file: File) => {
      const fileBase64 = await readFileAsBase64(file)
      const { publicUrl } = await uploadAssetFn({
        data: {
          eventId,
          assetType: 'backgrounds',
          filename: `bg-${moduleId}.png`,
          fileBase64,
          mimeType: file.type || 'image/png',
        },
      })
      const updated: EventConfig = {
        ...config,
        branding: {
          ...config.branding,
          screenBackgrounds: {
            ...(config.branding.screenBackgrounds ?? {}),
            [moduleId]: publicUrl,
          },
        },
      }
      await persist(updated)
    }
  }

  // --- Logo handler ---

  async function handleLogoUpload(file: File) {
    const fileBase64 = await readFileAsBase64(file)
    const { publicUrl } = await uploadAssetFn({
      data: {
        eventId,
        assetType: 'logos',
        filename: 'logo.png',
        fileBase64,
        mimeType: file.type || 'image/png',
      },
    })
    const updated: EventConfig = {
      ...config,
      branding: { ...config.branding, logoUrl: publicUrl },
    }
    await persist(updated)
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
        <span className="text-sm text-white">Assets</span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-8">Assets</h1>

      {/* Event Logo */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-300 mb-3">
          Event Logo
        </h2>
        <AssetSlot
          label="Logo"
          currentUrl={config.branding.logoUrl}
          onUpload={handleLogoUpload}
        />
      </section>

      {/* Theme Assets */}
      {aiModule && (
        <section className="mb-8">
          <h2 className="text-base font-semibold text-slate-300 mb-3">
            Theme Assets
          </h2>
          <div className="space-y-6">
            {aiModule.themes.map((theme) => {
              const tsTheme = tsModule?.themes.find((t) => t.id === theme.id)
              return (
                <div key={theme.id}>
                  <p className="text-sm text-slate-400 mb-2 font-medium capitalize">
                    {theme.label} ({theme.id})
                  </p>
                  <div className="space-y-2">
                    <AssetSlot
                      label="Frame Image"
                      currentUrl={theme.frameImageUrl}
                      onUpload={makeThemeUploader(
                        theme.id,
                        'frameImageUrl',
                        'frames',
                      )}
                    />
                    <AssetSlot
                      label="Template Image (AI face-swap source)"
                      currentUrl={theme.templateImageUrl}
                      onUpload={makeThemeUploader(
                        theme.id,
                        'templateImageUrl',
                        'templates',
                      )}
                    />
                    <AssetSlot
                      label="Preview Image (theme selection card)"
                      currentUrl={
                        tsTheme?.previewImageUrl ?? theme.previewImageUrl
                      }
                      onUpload={makePreviewUploader(theme.id)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Module Backgrounds */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-slate-300 mb-3">
          Module Backgrounds
        </h2>
        <div className="space-y-2">
          {config.moduleFlow.map((m) => (
            <AssetSlot
              key={m.moduleId}
              label={`${m.moduleId} background`}
              currentUrl={
                config.branding.screenBackgrounds?.[m.moduleId] ?? null
              }
              onUpload={makeBackgroundUploader(m.moduleId)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}
