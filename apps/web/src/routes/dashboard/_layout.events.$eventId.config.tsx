import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import type { ReactNode } from 'react'
import type { AiThemeConfig, EventConfig } from '../../types/event-config'

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

function ConfigEditorPage() {
  const initial = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const [config, setConfig] = useState<EventConfig>(initial)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = async () => {
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

  const updateFormField = (
    field: keyof EventConfig['formFields'],
    value: boolean,
  ) =>
    setConfig((c) => ({
      ...c,
      formFields: { ...c.formFields, [field]: value },
    }))

  const updateAiProvider = (provider: 'replicate' | 'google') =>
    setConfig((c) => ({ ...c, aiConfig: { ...c.aiConfig, provider } }))

  const updateTheme = (
    index: number,
    field: keyof AiThemeConfig,
    value: string | number,
  ) =>
    setConfig((c) => {
      const themes = [...c.aiConfig.themes]
      themes[index] = { ...themes[index], [field]: value }
      return { ...c, aiConfig: { ...c.aiConfig, themes } }
    })

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
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save Config'}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Branding */}
        <Section title="Branding">
          <ColorField
            label="Primary Color"
            value={config.branding.primaryColor}
            onChange={(v) => updateBranding('primaryColor', v)}
          />
          <ColorField
            label="Secondary Color"
            value={config.branding.secondaryColor}
            onChange={(v) => updateBranding('secondaryColor', v)}
          />
          <Field label="Logo URL">
            <input
              type="text"
              value={config.branding.logoUrl ?? ''}
              onChange={(e) =>
                updateBranding('logoUrl', e.target.value || null)
              }
              className={inputClass}
              placeholder="https://..."
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
          <Field label="Font Family">
            <input
              type="text"
              value={config.branding.fontFamily ?? ''}
              onChange={(e) =>
                updateBranding('fontFamily', e.target.value || null)
              }
              className={inputClass}
              placeholder="Inter"
            />
          </Field>
        </Section>

        {/* Tech Config */}
        <Section title="Tech Config">
          <Field label="Printer Name">
            <input
              type="text"
              value={config.techConfig.printerName}
              onChange={(e) => updateTech('printerName', e.target.value)}
              className={inputClass}
              placeholder="DS-RX1"
            />
          </Field>
          <Field label="Inactivity Timeout (seconds)">
            <input
              type="number"
              min={10}
              value={config.techConfig.inactivityTimeoutSeconds}
              onChange={(e) =>
                updateTech('inactivityTimeoutSeconds', Number(e.target.value))
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

        {/* Form Fields */}
        <Section title="Form Fields">
          <p className="text-xs text-slate-400 mb-3">
            Which fields to show on the guest form
          </p>
          {(
            Object.keys(config.formFields) as Array<
              keyof EventConfig['formFields']
            >
          ).map((field) => (
            <div key={field} className="mb-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.formFields[field]}
                  onChange={(e) => updateFormField(field, e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-500"
                />
                <span className="text-sm text-slate-300 capitalize">
                  {field}
                </span>
              </label>
            </div>
          ))}
        </Section>

        {/* AI Config */}
        <Section title="AI Config">
          <Field label="Provider">
            <select
              value={config.aiConfig.provider}
              onChange={(e) =>
                updateAiProvider(e.target.value as 'replicate' | 'google')
              }
              className={inputClass}
            >
              <option value="replicate">Replicate</option>
              <option value="google">Google</option>
            </select>
          </Field>

          {config.aiConfig.themes.map((theme, i) => (
            <div
              key={theme.id}
              className="mt-6 pt-6 border-t border-slate-700/60"
            >
              <h3 className="text-sm font-semibold text-slate-300 mb-4">
                Theme:{' '}
                <span className="font-mono text-blue-400">{theme.id}</span>
              </h3>
              <div className="space-y-3">
                <Field label="Label">
                  <input
                    type="text"
                    value={theme.label}
                    onChange={(e) => updateTheme(i, 'label', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Prompt">
                  <textarea
                    value={theme.prompt}
                    onChange={(e) => updateTheme(i, 'prompt', e.target.value)}
                    rows={4}
                    className={`${inputClass} resize-y`}
                  />
                </Field>
                <Field label="Preview Image URL">
                  <input
                    type="text"
                    value={theme.previewImageUrl}
                    onChange={(e) =>
                      updateTheme(i, 'previewImageUrl', e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Frame Image URL">
                  <input
                    type="text"
                    value={theme.frameImageUrl}
                    onChange={(e) =>
                      updateTheme(i, 'frameImageUrl', e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Template Image URL">
                  <input
                    type="text"
                    value={theme.templateImageUrl}
                    onChange={(e) =>
                      updateTheme(i, 'templateImageUrl', e.target.value)
                    }
                    className={inputClass}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Canvas Width">
                    <input
                      type="number"
                      value={theme.canvasWidth}
                      onChange={(e) =>
                        updateTheme(i, 'canvasWidth', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Canvas Height">
                    <input
                      type="number"
                      value={theme.canvasHeight}
                      onChange={(e) =>
                        updateTheme(i, 'canvasHeight', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Photo Width">
                    <input
                      type="number"
                      value={theme.photoWidth}
                      onChange={(e) =>
                        updateTheme(i, 'photoWidth', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Photo Height">
                    <input
                      type="number"
                      value={theme.photoHeight}
                      onChange={(e) =>
                        updateTheme(i, 'photoHeight', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Photo Offset X">
                    <input
                      type="number"
                      value={theme.photoOffsetX}
                      onChange={(e) =>
                        updateTheme(i, 'photoOffsetX', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Photo Offset Y">
                    <input
                      type="number"
                      value={theme.photoOffsetY}
                      onChange={(e) =>
                        updateTheme(i, 'photoOffsetY', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </div>
          ))}
        </Section>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-700 flex items-center justify-end gap-3">
        <SaveStatus />
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
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
          className={inputClass}
          placeholder="#ffffff"
        />
      </div>
    </Field>
  )
}
