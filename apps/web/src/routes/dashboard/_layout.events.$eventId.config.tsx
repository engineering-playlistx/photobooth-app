import React, { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import {
  AssetSlot,
  readFileAsBase64,
  uploadAssetFn,
} from '../../components/AssetSlot'
import type { ReactNode } from 'react'
import type { EventConfig, FontEntry } from '@photobooth/types'

const ALLOWED_FONT_EXTENSIONS = ['.woff2', '.woff', '.ttf', '.otf']

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

export const Route = createFileRoute(
  '/dashboard/_layout/events/$eventId/config',
)({
  loader: async ({ params }) =>
    await getEventConfig({ data: { eventId: params.eventId } }),
  component: ConfigEditorPage,
})

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

function validateConfig(config: EventConfig): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!HEX_COLOR_RE.test(config.branding.primaryColor)) {
    errors['branding.primaryColor'] = 'Must be a valid hex color (e.g. #ff0000)'
  }
  if (!HEX_COLOR_RE.test(config.branding.secondaryColor)) {
    errors['branding.secondaryColor'] =
      'Must be a valid hex color (e.g. #ffffff)'
  }

  const timeout = config.techConfig.inactivityTimeoutSeconds
  if (!Number.isInteger(timeout) || timeout < 10) {
    errors['techConfig.inactivityTimeoutSeconds'] = 'Must be an integer ≥ 10'
  }

  return errors
}

// Per-row state for font upload in progress
type FontUploadState = { uploading: boolean; error: string | null }

function ConfigEditorPage() {
  const initial = Route.useLoaderData()
  const { eventId } = Route.useParams()
  // Normalize fonts: old event configs stored before multi-font migration have no
  // `fonts` key — coerce undefined → [] at the boundary so the rest of the component
  // can safely assume fonts is always an array.
  const normalizedInitial: EventConfig = {
    ...initial,
    // Cast through unknown: the type says FontEntry[] but old stored JSON may
    // not have the key at all — runtime value is undefined for pre-migration events.
    branding: {
      ...initial.branding,
      fonts: (initial.branding.fonts as Array<FontEntry> | undefined) ?? [],
    },
  }
  const [config, setConfig] = useState<EventConfig>(normalizedInitial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})
  // Per-row upload state indexed by font position
  const [fontUploadStates, setFontUploadStates] = useState<
    Partial<Record<number, FontUploadState>>
  >({})
  const fontInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const isDirty = JSON.stringify(config) !== JSON.stringify(normalizedInitial)

  const fonts: Array<FontEntry> = config.branding.fonts

  const setFontState = (idx: number, patch: Partial<FontUploadState>) =>
    setFontUploadStates((s) => ({
      ...s,
      [idx]: { uploading: false, error: null, ...(s[idx] ?? {}), ...patch },
    }))

  const updateFonts = (next: Array<FontEntry>) =>
    setConfig((c) => ({ ...c, branding: { ...c.branding, fonts: next } }))

  const handleFontFamilyChange = (idx: number, value: string) => {
    const next = fonts.map((f, i) => (i === idx ? { ...f, family: value } : f))
    updateFonts(next)
  }

  const handleFontFileChange = async (
    idx: number,
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
    if (!ALLOWED_FONT_EXTENSIONS.includes(ext)) {
      setFontState(idx, { error: 'Font must be .woff2, .woff, .ttf, or .otf' })
      const ref = fontInputRefs.current[idx]
      if (ref) ref.value = ''
      return
    }
    setFontState(idx, { uploading: true, error: null })
    try {
      const fileBase64 = await readFileAsBase64(file)
      const { publicUrl } = await uploadAssetFn({
        data: {
          eventId,
          assetType: 'fonts',
          filename: file.name,
          fileBase64,
          mimeType: file.type || 'font/woff2',
        },
      })
      const next = fonts.map((f, i) =>
        i === idx ? { ...f, url: publicUrl } : f,
      )
      const updated = {
        ...config,
        branding: { ...config.branding, fonts: next },
      }
      setConfig(updated)
      await saveEventConfig({ data: { eventId, config: updated } })
      setFontState(idx, { uploading: false, error: null })
    } catch (err) {
      setFontState(idx, {
        uploading: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      })
    } finally {
      const ref = fontInputRefs.current[idx]
      if (ref) ref.value = ''
    }
  }

  const handleAddFont = () => {
    updateFonts([...fonts, { family: '', url: '' }])
  }

  const handleRemoveFont = async (idx: number) => {
    const next = fonts.filter((_, i) => i !== idx)
    const updated = { ...config, branding: { ...config.branding, fonts: next } }
    setConfig(updated)
    await saveEventConfig({ data: { eventId, config: updated } })
  }

  const handleDiscard = () => {
    setConfig(normalizedInitial)
    setValidationErrors({})
    setStatus('idle')
  }

  const handleSave = async () => {
    const errors = validateConfig(config)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidationErrors({})
    if (!confirm('Save config? Incorrect values may break the kiosk.')) return
    setSaving(true)
    setStatus('idle')
    try {
      await saveEventConfig({ data: { eventId, config } })
      setStatus('saved')
    } catch (e) {
      setStatus('error')
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  const updateBranding = (
    field: keyof EventConfig['branding'],
    value: string | null,
  ) => setConfig((c) => ({ ...c, branding: { ...c.branding, [field]: value } }))

  const updateTech = (
    field: keyof EventConfig['techConfig'],
    value: string | number | boolean,
  ) =>
    setConfig((c) => ({
      ...c,
      techConfig: { ...c.techConfig, [field]: value },
    }))

  const handleLogoUpload = async (file: File) => {
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
    const updated = {
      ...config,
      branding: { ...config.branding, logoUrl: publicUrl },
    }
    setConfig(updated)
    await saveEventConfig({ data: { eventId, config: updated } })
  }

  const SaveStatus = () => (
    <>
      {status === 'saved' && (
        <span className="text-sm text-green-400">Saved successfully</span>
      )}
      {status === 'error' && (
        <span className="text-sm text-red-400">{errorMsg}</span>
      )}
    </>
  )

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/dashboard/events/$eventId"
          params={{ eventId }}
          className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← {eventId}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-white">Config</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Event Config</h1>
        <div className="flex items-center gap-3">
          <SaveStatus />
          {isDirty && (
            <button
              onClick={handleDiscard}
              disabled={saving}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg transition-colors"
            >
              Discard changes
            </button>
          )}
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        </div>
      </div>

      {Object.keys(validationErrors).length > 0 && (
        <div className="mb-6 p-4 bg-red-900/40 border border-red-700 rounded-lg">
          <p className="text-sm font-semibold text-red-300 mb-2">
            Please fix the following errors before saving:
          </p>
          <ul className="space-y-1">
            {Object.values(validationErrors).map((msg, i) => (
              <li key={i} className="text-sm text-red-400">
                • {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-6">
        {/* Branding */}
        <Section title="Branding">
          <ColorField
            label="Primary Color"
            value={config.branding.primaryColor}
            onChange={(v) => updateBranding('primaryColor', v)}
            error={validationErrors['branding.primaryColor']}
          />
          <ColorField
            label="Secondary Color"
            value={config.branding.secondaryColor}
            onChange={(v) => updateBranding('secondaryColor', v)}
            error={validationErrors['branding.secondaryColor']}
          />
          <Field label="Logo">
            <AssetSlot
              label="Logo image"
              currentUrl={config.branding.logoUrl}
              onUpload={handleLogoUpload}
            />
          </Field>
          <Field label="Background URL">
            <input
              type="text"
              value={config.branding.backgroundUrl ?? ''}
              onChange={(e) =>
                updateBranding('backgroundUrl', e.target.value || null)
              }
              className={inputClass}
              placeholder="https://..."
            />
          </Field>
          <Field label="Fonts">
            <div className="flex flex-col gap-3">
              {fonts.length === 0 && (
                <p className="text-xs text-slate-500">No fonts added.</p>
              )}
              {fonts.map((font, idx) => {
                const state = fontUploadStates[idx]
                return (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 p-3 bg-slate-900/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={font.family}
                        onChange={(e) =>
                          handleFontFamilyChange(idx, e.target.value)
                        }
                        placeholder="Font family name (e.g. MyBrand)"
                        className={`${inputClass} flex-1`}
                      />
                      <button
                        onClick={() => void handleRemoveFont(idx)}
                        className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-800/50 hover:bg-red-900/40 rounded transition-colors shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        ref={(el) => {
                          fontInputRefs.current[idx] = el
                        }}
                        type="file"
                        accept=".woff2,.woff,.ttf,.otf"
                        className="hidden"
                        onChange={(e) => {
                          void handleFontFileChange(idx, e)
                        }}
                      />
                      <button
                        disabled={state?.uploading}
                        onClick={() => fontInputRefs.current[idx]?.click()}
                        className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
                      >
                        {state?.uploading ? 'Uploading…' : 'Upload file'}
                      </button>
                      {font.url && (
                        <span className="text-xs text-slate-400 truncate">
                          {font.url.split('/').pop()}
                        </span>
                      )}
                    </div>
                    {state?.error && (
                      <p className="text-xs text-red-400">{state.error}</p>
                    )}
                  </div>
                )
              })}
              <button
                onClick={handleAddFont}
                className="self-start px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
              >
                + Add font
              </button>
              <p className="text-xs text-slate-600">
                Accepted: .woff2, .woff, .ttf, .otf
              </p>
            </div>
          </Field>
        </Section>

        {/* Tech Config */}
        <Section title="Tech Config">
          <Field label="Inactivity Timeout (seconds)">
            <input
              type="number"
              min={10}
              value={config.techConfig.inactivityTimeoutSeconds}
              onChange={(e) =>
                updateTech('inactivityTimeoutSeconds', Number(e.target.value))
              }
              className={`${inputClass} ${validationErrors['techConfig.inactivityTimeoutSeconds'] ? 'border-red-500' : ''}`}
            />
            {validationErrors['techConfig.inactivityTimeoutSeconds'] && (
              <p className="mt-1 text-xs text-red-400">
                {validationErrors['techConfig.inactivityTimeoutSeconds']}
              </p>
            )}
          </Field>
          <Field label="Inactivity Warning Duration (seconds)">
            <input
              type="number"
              min={5}
              value={config.techConfig.inactivityWarningSeconds ?? 15}
              onChange={(e) =>
                updateTech('inactivityWarningSeconds', Number(e.target.value))
              }
              className={inputClass}
            />
          </Field>
          <div className="mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.techConfig.guestPortalEnabled}
                onChange={(e) =>
                  updateTech('guestPortalEnabled', e.target.checked)
                }
                className="w-4 h-4 rounded accent-blue-500"
              />
              <span className="text-sm text-slate-300">
                Guest Portal Enabled
              </span>
            </label>
          </div>
        </Section>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-700 flex items-center justify-end gap-3">
        <SaveStatus />
        {isDirty && (
          <button
            onClick={handleDiscard}
            disabled={saving}
            className="px-5 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 rounded-lg transition-colors font-medium"
          >
            Discard changes
          </button>
        )}
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
        >
          {saving ? 'Saving…' : 'Save Config'}
        </button>
      </div>
    </div>
  )
}

const inputClass =
  'w-full px-3 py-2 bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none rounded-lg text-white text-sm placeholder:text-slate-500 transition-colors'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
      <h2 className="text-base font-semibold text-white mb-4">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <div
          className="w-8 h-8 rounded border border-slate-600 shrink-0"
          style={{ backgroundColor: value }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${error ? 'border-red-500' : ''}`}
          placeholder="#ffffff"
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </Field>
  )
}
