import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { validateModuleFlow } from '../../utils/validate-module-flow'
import {
  AssetSlot,
  readFileAsBase64,
  uploadAssetFn,
} from '../../components/AssetSlot'
import type { ReactNode } from 'react'
import type {
  AiGenerationModuleConfig,
  AiThemeConfig,
  EventConfig,
  FormFieldsConfig,
  FormModuleConfig,
  MiniQuizModuleConfig,
  ModuleConfig,
  ModuleCustomization,
  ResultModuleConfig,
  ThemeSelectionModuleConfig,
  WelcomeModuleConfig,
} from '@photobooth/types'

const getFlowConfig = createServerFn({ method: 'GET' }).handler(async (ctx) => {
  const { eventId } = ctx.data as { eventId: string }
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('event_configs')
    .select('config_json')
    .eq('event_id', eventId)
    .single()
  if (error) throw new Error(error.message)
  return data.config_json as EventConfig
})

const saveFlowConfig = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, moduleFlow, formFields, printerName } = ctx.data as {
      eventId: string
      moduleFlow: Array<ModuleConfig>
      formFields: FormFieldsConfig
      printerName: string
    }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()
    if (error) throw new Error(error.message)
    const existing = data.config_json as EventConfig
    const merged: EventConfig = {
      ...existing,
      moduleFlow,
      formFields,
      techConfig: { ...existing.techConfig, printerName },
    }
    const { error: updateError } = await admin
      .from('event_configs')
      .update({ config_json: merged, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
    if (updateError) throw new Error(updateError.message)
  },
)

const saveModuleBackground = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, moduleId, publicUrl } = ctx.data as {
      eventId: string
      moduleId: string
      publicUrl: string | null
    }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()
    if (error) throw new Error(error.message)
    const existing = data.config_json as EventConfig
    const updatedBackgrounds = {
      ...(existing.branding.screenBackgrounds ?? {}),
    }
    if (publicUrl === null) {
      delete updatedBackgrounds[moduleId]
    } else {
      updatedBackgrounds[moduleId] = publicUrl
    }
    const merged: EventConfig = {
      ...existing,
      branding: {
        ...existing.branding,
        screenBackgrounds: updatedBackgrounds,
      },
    }
    const { error: updateError } = await admin
      .from('event_configs')
      .update({ config_json: merged, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
    if (updateError) throw new Error(updateError.message)
  },
)

const saveThemeAssetUrl = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, themeId, field, publicUrl } = ctx.data as {
      eventId: string
      themeId: string
      field: 'frameImageUrl' | 'templateImageUrl' | 'previewImageUrl'
      publicUrl: string
    }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()
    if (error) throw new Error(error.message)
    const existing = data.config_json as EventConfig
    const merged: EventConfig = {
      ...existing,
      moduleFlow: existing.moduleFlow.map((m) => {
        if (m.moduleId === 'ai-generation')
          return {
            ...m,
            themes: m.themes.map((t) =>
              t.id === themeId ? { ...t, [field]: publicUrl } : t,
            ),
          }
        if (m.moduleId === 'theme-selection' && field === 'previewImageUrl')
          return {
            ...m,
            themes: m.themes.map((t) =>
              t.id === themeId ? { ...t, previewImageUrl: publicUrl } : t,
            ),
          }
        return m
      }),
    }
    const { error: updateError } = await admin
      .from('event_configs')
      .update({ config_json: merged, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
    if (updateError) throw new Error(updateError.message)
  },
)

export const Route = createFileRoute('/dashboard/_layout/events/$eventId/flow')(
  {
    loader: async ({ params }) =>
      await getFlowConfig({ data: { eventId: params.eventId } }),
    component: FlowBuilderPage,
  },
)

interface FlowExtras {
  backgrounds: Record<string, string | null>
  onBackgroundUpload: (moduleId: string, file: File) => Promise<void>
  onBackgroundRemove: (moduleId: string) => Promise<void>
  onThemeAssetUpload: (
    themeId: string,
    field: 'frameImageUrl' | 'templateImageUrl' | 'previewImageUrl',
    file: File,
  ) => Promise<void>
  formFields: FormFieldsConfig
  onFormFieldChange: (field: keyof FormFieldsConfig, value: boolean) => void
  printerName: string
  onPrinterNameChange: (name: string) => void
}

const MODULE_LABELS: Record<string, string> = {
  welcome: 'Welcome Screen',
  'theme-selection': 'Theme Selection',
  camera: 'Camera',
  form: 'Form',
  'ai-generation': 'AI Generation',
  result: 'Result',
  'mini-quiz': 'Mini Quiz',
}

const FIXED_POSITIONS = new Set(['fixed-first', 'fixed-camera', 'fixed-last'])

function isFixed(module: ModuleConfig): boolean {
  return FIXED_POSITIONS.has(module.position)
}

function hasNonEmptyConfig(module: ModuleConfig): boolean {
  if (module.moduleId === 'ai-generation') return module.themes.length > 0
  if (module.moduleId === 'theme-selection') return module.themes.length > 0
  if (module.moduleId === 'mini-quiz') return module.questions.length > 0
  return false
}

const POSITION_LABELS: Record<string, string> = {
  'fixed-first': 'fixed-first',
  'pre-photo': 'pre-photo',
  'fixed-camera': 'fixed-camera',
  'post-photo': 'post-photo',
  'fixed-last': 'fixed-last',
  flexible: 'flexible',
}

const ADDABLE_MODULES: Array<{
  type: 'theme-selection' | 'ai-generation' | 'form' | 'mini-quiz'
  label: string
  single: boolean
}> = [
  { type: 'theme-selection', label: 'Theme Selection', single: true },
  { type: 'ai-generation', label: 'AI Generation', single: true },
  { type: 'form', label: 'Form', single: true },
  { type: 'mini-quiz', label: 'Mini Quiz', single: false },
]

const BLANK_AI_THEME: AiThemeConfig = {
  id: '',
  label: '',
  previewImageUrl: '',
  frameImageUrl: '',
  templateImageUrl: '',
  prompt: '',
  canvasWidth: 1080,
  canvasHeight: 1920,
  photoWidth: 1080,
  photoHeight: 1920,
  photoOffsetX: 0,
  photoOffsetY: 0,
}

// ─── Per-module element catalogs (keys match pb-<moduleId>-<elementKey> classes) ──

type ElementDef = { key: string; label: string; defaultCopy?: string }

const WELCOME_ELEMENTS: Array<ElementDef> = [
  { key: 'ctaButton', label: 'CTA Button', defaultCopy: 'Tap to Start' },
]

const THEME_SELECTION_ELEMENTS: Array<ElementDef> = [
  {
    key: 'header',
    label: 'Header',
    defaultCopy: 'Who do you want to be today?',
  },
  { key: 'themeCard', label: 'Theme Card' },
]

const CAMERA_ELEMENTS: Array<ElementDef> = [
  { key: 'retakeButton', label: 'Retake Button', defaultCopy: 'Retake' },
  { key: 'captureButton', label: 'Capture Button' },
  { key: 'nextButton', label: 'Next Button', defaultCopy: 'Next' },
]

const AI_GENERATION_ELEMENTS: Array<ElementDef> = [
  { key: 'statusText', label: 'Status Text' },
]

const FORM_ELEMENTS: Array<ElementDef> = [
  {
    key: 'header',
    label: 'Header',
    defaultCopy: 'Complete your details before printing your photo',
  },
  { key: 'submitButton', label: 'Submit Button', defaultCopy: 'Confirm' },
]

const RESULT_ELEMENTS: Array<ElementDef> = [
  { key: 'header', label: 'Header', defaultCopy: 'Ready to Race!' },
  {
    key: 'printButton',
    label: 'Print Button',
    defaultCopy: 'Print & Download',
  },
  { key: 'retryButton', label: 'Retry Button', defaultCopy: 'Retry Result' },
  { key: 'backButton', label: 'Back Button', defaultCopy: 'Back to Home' },
]

// ─── CustomizationSection ────────────────────────────────────────────────────

function CustomizationSection({
  elements,
  customization,
  onUpdate,
}: {
  elements: Array<ElementDef>
  customization: ModuleCustomization | undefined
  onUpdate: (patch: Partial<ModuleConfig>) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const inputCls =
    'flex-1 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500 placeholder:text-slate-600'

  const updateField = (key: string, field: 'copy' | 'css', value: string) => {
    const current = customization?.elements ?? {}
    const currentEl = current[key] ?? {}
    const merged = { ...currentEl, [field]: value }
    const pruned: { copy?: string; css?: string } = {}
    if (merged.copy) pruned.copy = merged.copy
    if (merged.css) pruned.css = merged.css

    const updatedElements = { ...current }
    if (!pruned.copy && !pruned.css) {
      delete updatedElements[key]
    } else {
      updatedElements[key] = pruned
    }
    onUpdate({
      customization: { elements: updatedElements },
    } as Partial<ModuleConfig>)
  }

  return (
    <div className="border-t border-slate-700/50 mt-4 pt-4">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors uppercase tracking-wide"
      >
        <span>{isOpen ? '▼' : '▶'}</span>
        Customization
      </button>
      {isOpen && (
        <div className="mt-3 space-y-4">
          {elements.map(({ key, label, defaultCopy }) => (
            <div
              key={key}
              className="border border-slate-700/50 rounded p-3 space-y-2"
            >
              <p className="text-xs font-medium text-slate-300">{label}</p>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 w-8 shrink-0">
                  Copy
                </label>
                <input
                  type="text"
                  placeholder={defaultCopy ?? ''}
                  value={customization?.elements?.[key]?.copy ?? ''}
                  onChange={(e) => updateField(key, 'copy', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-start gap-2">
                <label className="text-xs text-slate-500 w-8 shrink-0 mt-1">
                  CSS
                </label>
                <textarea
                  placeholder="color: red; font-size: 20px"
                  value={customization?.elements?.[key]?.css ?? ''}
                  onChange={(e) => updateField(key, 'css', e.target.value)}
                  rows={2}
                  className={`${inputCls} resize-y font-mono`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FlowBuilderPage() {
  const initialConfig = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const [flow, setFlow] = useState<Array<ModuleConfig>>(
    initialConfig.moduleFlow,
  )
  const [savedFlow, setSavedFlow] = useState<Array<ModuleConfig>>(
    initialConfig.moduleFlow,
  )
  const [formFields, setFormFields] = useState<FormFieldsConfig>(
    initialConfig.formFields,
  )
  const [savedFormFields, setSavedFormFields] = useState<FormFieldsConfig>(
    initialConfig.formFields,
  )
  const [printerName, setPrinterName] = useState(
    initialConfig.techConfig.printerName,
  )
  const [savedPrinterName, setSavedPrinterName] = useState(
    initialConfig.techConfig.printerName,
  )
  const [backgrounds, setBackgrounds] = useState<Record<string, string | null>>(
    initialConfig.branding.screenBackgrounds ?? {},
  )
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  const isDirty =
    JSON.stringify(flow) !== JSON.stringify(savedFlow) ||
    JSON.stringify(formFields) !== JSON.stringify(savedFormFields) ||
    printerName !== savedPrinterName

  const handleBackgroundUpload = async (moduleId: string, file: File) => {
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
    await saveModuleBackground({ data: { eventId, moduleId, publicUrl } })
    setBackgrounds((prev) => ({ ...prev, [moduleId]: publicUrl }))
  }

  const handleBackgroundRemove = async (moduleId: string) => {
    await saveModuleBackground({ data: { eventId, moduleId, publicUrl: null } })
    setBackgrounds((prev) => {
      const next = { ...prev }
      delete next[moduleId]
      return next
    })
  }

  const handleThemeAssetUpload = async (
    themeId: string,
    field: 'frameImageUrl' | 'templateImageUrl' | 'previewImageUrl',
    file: File,
  ) => {
    const assetType = field === 'frameImageUrl' ? 'frames' : 'templates'
    const prefix =
      field === 'frameImageUrl'
        ? 'frame'
        : field === 'templateImageUrl'
          ? 'template'
          : 'preview'
    const fileBase64 = await readFileAsBase64(file)
    const { publicUrl } = await uploadAssetFn({
      data: {
        eventId,
        assetType,
        filename: `${prefix}-${themeId}.png`,
        fileBase64,
        mimeType: file.type || 'image/png',
      },
    })
    await saveThemeAssetUrl({ data: { eventId, themeId, field, publicUrl } })
    setFlow((f) =>
      f.map((m) => {
        if (m.moduleId === 'ai-generation')
          return {
            ...m,
            themes: m.themes.map((t) =>
              t.id === themeId ? { ...t, [field]: publicUrl } : t,
            ),
          }
        if (m.moduleId === 'theme-selection' && field === 'previewImageUrl')
          return {
            ...m,
            themes: m.themes.map((t) =>
              t.id === themeId ? { ...t, previewImageUrl: publicUrl } : t,
            ),
          }
        return m
      }),
    )
  }

  const extras: FlowExtras = {
    backgrounds,
    onBackgroundUpload: handleBackgroundUpload,
    onBackgroundRemove: handleBackgroundRemove,
    onThemeAssetUpload: handleThemeAssetUpload,
    formFields,
    onFormFieldChange: (field, value) =>
      setFormFields((prev) => ({ ...prev, [field]: value })),
    printerName,
    onPrinterNameChange: setPrinterName,
  }

  const canMoveUp = (i: number) => {
    if (isFixed(flow[i]) || i <= 0) return false
    const above = flow[i - 1]
    if (above.position === 'fixed-first' || above.position === 'fixed-last')
      return false
    if (above.position === 'fixed-camera' && flow[i].position !== 'flexible')
      return false
    return true
  }

  const canMoveDown = (i: number) => {
    if (isFixed(flow[i]) || i >= flow.length - 1) return false
    const below = flow[i + 1]
    if (below.position === 'fixed-first' || below.position === 'fixed-last')
      return false
    if (below.position === 'fixed-camera' && flow[i].position !== 'flexible')
      return false
    return true
  }

  const moveUp = (i: number) => {
    if (!canMoveUp(i)) return
    setFlow((f) => {
      const next = [...f]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  const moveDown = (i: number) => {
    if (!canMoveDown(i)) return
    setFlow((f) => {
      const next = [...f]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  const removeModule = (i: number) => {
    const module = flow[i]
    if (
      hasNonEmptyConfig(module) &&
      !confirm(
        `Remove "${MODULE_LABELS[module.moduleId] ?? module.moduleId}"? It has configured data that will be lost.`,
      )
    )
      return
    setFlow((f) => f.filter((_, idx) => idx !== i))
  }

  const [showPicker, setShowPicker] = useState(false)

  const hasModule = (id: string) => flow.some((m) => m.moduleId === id)

  const addModule = (
    type: 'theme-selection' | 'ai-generation' | 'form' | 'mini-quiz',
  ) => {
    setShowPicker(false)
    setFlow((f) => {
      const next = [...f]
      if (type === 'theme-selection') {
        const newModule: ThemeSelectionModuleConfig = {
          moduleId: 'theme-selection',
          position: 'pre-photo',
          outputKey: 'selectedTheme',
          themes: [],
        }
        const cameraIdx = next.findIndex((m) => m.moduleId === 'camera')
        next.splice(cameraIdx, 0, newModule)
      } else if (type === 'ai-generation') {
        const newModule: AiGenerationModuleConfig = {
          moduleId: 'ai-generation',
          position: 'post-photo',
          outputKey: 'finalPhoto',
          provider: 'replicate',
          themes: [],
        }
        const resultIdx = next.findIndex((m) => m.moduleId === 'result')
        next.splice(resultIdx, 0, newModule)
      } else if (type === 'form') {
        const newModule: FormModuleConfig = {
          moduleId: 'form',
          position: 'post-photo',
          outputKey: 'userInfo',
        }
        const resultIdx = next.findIndex((m) => m.moduleId === 'result')
        next.splice(resultIdx, 0, newModule)
      } else {
        const newModule: MiniQuizModuleConfig = {
          moduleId: 'mini-quiz',
          position: 'flexible',
          outputKey: 'quizAnswer',
          questions: [],
        }
        const resultIdx = next.findIndex((m) => m.moduleId === 'result')
        next.splice(resultIdx, 0, newModule)
      }
      return next
    })
  }

  const updateModule = (index: number, patch: Partial<ModuleConfig>) =>
    setFlow((f) => f.map((m, i) => (i === index ? { ...m, ...patch } : m)))

  const handleDiscard = () => {
    setFlow(savedFlow)
    setFormFields(savedFormFields)
    setPrinterName(savedPrinterName)
    setValidationErrors({})
    setSaveStatus('idle')
  }

  const handleSave = async () => {
    const errors = validateModuleFlow(flow)
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    if (!confirm('Save flow changes to Supabase?')) return
    setValidationErrors({})
    setSaveStatus('saving')
    try {
      await saveFlowConfig({
        data: { eventId, moduleFlow: flow, formFields, printerName },
      })
      setSavedFlow(flow)
      setSavedFormFields(formFields)
      setSavedPrinterName(printerName)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/dashboard/events/$eventId"
          params={{ eventId }}
          className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
        >
          ← {eventId}
        </Link>
        <span className="text-slate-700">/</span>
        <span className="text-sm text-white">Flow Builder</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">Flow Builder</h1>
        <div className="flex items-center gap-2">
          {saveStatus === 'saved' && !isDirty && (
            <span className="text-xs text-green-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-400">Save failed</span>
          )}
          {saveStatus === 'saving' && (
            <span className="text-xs text-slate-400">Saving…</span>
          )}
          {isDirty && (
            <>
              <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
                Unsaved changes
              </span>
              <button
                onClick={handleDiscard}
                className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 border border-slate-700 rounded-lg"
              >
                Discard
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saveStatus === 'saving'}
                className="text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-3 py-1.5 rounded-lg"
              >
                Save Flow
              </button>
            </>
          )}
        </div>
      </div>

      {Object.keys(validationErrors).length > 0 && (
        <div className="mb-4 p-3 border border-red-500/30 bg-red-500/10 rounded-lg space-y-1">
          <p className="text-xs font-medium text-red-400">
            Fix the following errors before saving:
          </p>
          {Object.entries(validationErrors).map(([key, msg]) => (
            <p key={key} className="text-xs text-red-300">
              {msg}
            </p>
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {flow.map((module, index) => (
          <li key={`${module.moduleId}-${index}`}>
            <ModuleCard
              module={module}
              flow={flow}
              position={index + 1}
              canMoveUp={canMoveUp(index)}
              canMoveDown={canMoveDown(index)}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onRemove={() => removeModule(index)}
              onUpdate={(patch) => updateModule(index, patch)}
              onUpdateFlow={setFlow}
              extras={extras}
            />
          </li>
        ))}
      </ol>

      <div className="mt-4">
        {showPicker ? (
          <div className="border border-slate-700 rounded-lg bg-slate-800/50 p-4">
            <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">
              Add Module
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ADDABLE_MODULES.map(({ type, label, single }) => {
                const disabled = single && hasModule(type)
                return (
                  <button
                    key={type}
                    onClick={() => !disabled && addModule(type)}
                    disabled={disabled}
                    className="flex flex-col items-start p-3 rounded-lg border border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
                  >
                    <span className="text-sm font-medium text-white">
                      {label}
                    </span>
                    <span className="font-mono text-xs text-slate-500 mt-0.5">
                      {type}
                    </span>
                    {disabled && (
                      <span className="text-xs text-slate-500 mt-1">
                        already in flow
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setShowPicker(false)}
              className="mt-3 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-2.5 border border-dashed border-slate-700 hover:border-slate-500 text-slate-400 hover:text-slate-300 rounded-lg text-sm transition-colors"
          >
            + Add Module
          </button>
        )}
      </div>
    </div>
  )
}

function ModuleCard({
  module,
  flow,
  position,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
  onUpdate,
  onUpdateFlow,
  extras,
}: {
  module: ModuleConfig
  flow: Array<ModuleConfig>
  position: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
  onUpdate: (patch: Partial<ModuleConfig>) => void
  onUpdateFlow: (
    updater: (f: Array<ModuleConfig>) => Array<ModuleConfig>,
  ) => void
  extras: FlowExtras
}) {
  const [isOpen, setIsOpen] = useState(false)
  const fixed = isFixed(module)
  const label = MODULE_LABELS[module.moduleId] ?? module.moduleId

  return (
    <div
      className={`rounded-lg border ${
        fixed
          ? 'bg-slate-800/30 border-slate-700/50'
          : 'bg-slate-800/50 border-slate-700'
      }`}
    >
      <div className="flex items-center gap-4 p-4">
        <span className="text-slate-500 text-sm font-mono w-6 text-center shrink-0">
          {position}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{label}</span>
            <span className="font-mono text-xs text-blue-400 bg-blue-400/10 border border-blue-400/20 px-1.5 py-0.5 rounded">
              {module.moduleId}
            </span>
            <span className="text-xs text-slate-500 bg-slate-700/50 border border-slate-600/50 px-1.5 py-0.5 rounded">
              {POSITION_LABELS[module.position] ?? module.position}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsOpen((v) => !v)}
            className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            title={isOpen ? 'Collapse' : 'Configure'}
          >
            {isOpen ? '▲ Configure' : '▼ Configure'}
          </button>

          {fixed ? (
            <span
              className="text-slate-500"
              title="Fixed — cannot be moved or removed"
            >
              🔒
            </span>
          ) : (
            <>
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={onMoveUp}
                  disabled={!canMoveUp}
                  className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors text-xs leading-none"
                  title="Move up"
                >
                  ▲
                </button>
                <button
                  onClick={onMoveDown}
                  disabled={!canMoveDown}
                  className="px-1.5 py-0.5 text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors text-xs leading-none"
                  title="Move down"
                >
                  ▼
                </button>
              </div>
              <button
                onClick={onRemove}
                className="px-1.5 py-1 text-slate-500 hover:text-red-400 transition-colors text-sm leading-none"
                title="Remove module"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="border-t border-slate-700 px-4 pb-4 pt-3">
          <ConfigPanel
            module={module}
            flow={flow}
            onUpdate={onUpdate}
            onUpdateFlow={onUpdateFlow}
            extras={extras}
          />
        </div>
      )}
    </div>
  )
}

function ConfigPanel({
  module,
  flow,
  onUpdate,
  onUpdateFlow,
  extras,
}: {
  module: ModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
  onUpdateFlow: (
    updater: (f: Array<ModuleConfig>) => Array<ModuleConfig>,
  ) => void
  extras: FlowExtras
}) {
  const bgSlot = (
    <div className="border-t border-slate-700/50 mt-4 pt-4">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
        Background
      </p>
      <AssetSlot
        label="Screen background image"
        currentUrl={extras.backgrounds[module.moduleId] ?? null}
        onUpload={(file) => extras.onBackgroundUpload(module.moduleId, file)}
        onRemove={
          extras.backgrounds[module.moduleId]
            ? () => extras.onBackgroundRemove(module.moduleId)
            : undefined
        }
      />
    </div>
  )

  if (module.moduleId === 'welcome') {
    return <WelcomePanel module={module} onUpdate={onUpdate} bgSlot={bgSlot} />
  }
  if (module.moduleId === 'camera') {
    return (
      <div>
        <label className="block text-xs text-slate-400 mb-1">Max Retakes</label>
        <input
          type="number"
          min={1}
          max={10}
          value={module.maxRetakes}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) onUpdate({ maxRetakes: v } as Partial<ModuleConfig>)
          }}
          className="w-24 px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
        />
        {bgSlot}
        <CustomizationSection
          elements={CAMERA_ELEMENTS}
          customization={module.customization}
          onUpdate={onUpdate}
        />
      </div>
    )
  }
  if (module.moduleId === 'theme-selection') {
    return (
      <ThemeSelectionPanel
        module={module}
        flow={flow}
        onUpdate={onUpdate}
        bgSlot={bgSlot}
      />
    )
  }
  if (module.moduleId === 'ai-generation') {
    return (
      <AiGenerationPanel
        module={module}
        flow={flow}
        onUpdate={onUpdate}
        onUpdateFlow={onUpdateFlow}
        bgSlot={bgSlot}
        onThemeAssetUpload={extras.onThemeAssetUpload}
      />
    )
  }
  if (module.moduleId === 'form') {
    return (
      <FormPanel
        module={module}
        onUpdate={onUpdate}
        bgSlot={bgSlot}
        formFields={extras.formFields}
        onFormFieldChange={extras.onFormFieldChange}
      />
    )
  }
  if (module.moduleId === 'result') {
    return (
      <ResultPanel
        module={module}
        onUpdate={onUpdate}
        bgSlot={bgSlot}
        printerName={extras.printerName}
        onPrinterNameChange={extras.onPrinterNameChange}
      />
    )
  }
  return <MiniQuizPanel module={module} onUpdate={onUpdate} bgSlot={bgSlot} />
}

function ThemeSelectionPanel({
  module,
  flow,
  onUpdate,
  bgSlot,
}: {
  module: ThemeSelectionModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
  bgSlot: ReactNode
}) {
  const aiModule = flow.find(
    (m): m is AiGenerationModuleConfig => m.moduleId === 'ai-generation',
  )

  const inputCls =
    'flex-1 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500'

  if (aiModule) {
    // Sync mode — IDs come from ai-generation; operator edits label + previewImageUrl only
    const rebuildThemes = (
      id: string,
      field: 'label' | 'previewImageUrl',
      value: string,
    ) => {
      const updated = aiModule.themes.map((at) => {
        const existing = module.themes.find((t) => t.id === at.id) ?? {
          id: at.id,
          label: '',
          previewImageUrl: '',
        }
        return at.id === id ? { ...existing, [field]: value } : existing
      })
      onUpdate({ themes: updated } as Partial<ModuleConfig>)
    }

    return (
      <div className="space-y-4">
        <p className="text-xs text-slate-500 italic">
          Theme IDs are controlled by the AI Generation module.
        </p>
        {aiModule.themes.map((aiTheme) => {
          const ts = module.themes.find((t) => t.id === aiTheme.id) ?? {
            id: aiTheme.id,
            label: '',
            previewImageUrl: '',
          }
          return (
            <div
              key={aiTheme.id}
              className="border border-slate-700 rounded p-3 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-24 shrink-0">
                  Theme ID
                </span>
                <span className="font-mono text-xs text-blue-400">
                  {aiTheme.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-24 shrink-0">
                  Label
                </label>
                <input
                  type="text"
                  value={ts.label}
                  onChange={(e) =>
                    rebuildThemes(aiTheme.id, 'label', e.target.value)
                  }
                  className={inputCls}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-24 shrink-0">
                  Preview URL
                </label>
                <input
                  type="text"
                  value={ts.previewImageUrl}
                  onChange={(e) =>
                    rebuildThemes(aiTheme.id, 'previewImageUrl', e.target.value)
                  }
                  className={inputCls}
                />
              </div>
            </div>
          )
        })}
        {bgSlot}
        <CustomizationSection
          elements={THEME_SELECTION_ELEMENTS}
          customization={module.customization}
          onUpdate={onUpdate}
        />
      </div>
    )
  }

  // Standalone mode — full theme list editor
  const updateTheme = (
    i: number,
    field: 'id' | 'label' | 'previewImageUrl',
    value: string,
  ) => {
    const updated = module.themes.map((t, j) =>
      j === i ? { ...t, [field]: value } : t,
    )
    onUpdate({ themes: updated } as Partial<ModuleConfig>)
  }

  return (
    <div className="space-y-3">
      {module.themes.map((theme, i) => (
        <div
          key={i}
          className="border border-slate-700 rounded p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">
              Theme ID
            </label>
            <input
              type="text"
              value={theme.id}
              onChange={(e) => updateTheme(i, 'id', e.target.value)}
              className={inputCls}
            />
            <button
              onClick={() =>
                onUpdate({
                  themes: module.themes.filter((_, j) => j !== i),
                } as Partial<ModuleConfig>)
              }
              className="text-slate-500 hover:text-red-400 transition-colors text-sm leading-none"
              title="Remove theme"
            >
              ×
            </button>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">
              Label
            </label>
            <input
              type="text"
              value={theme.label}
              onChange={(e) => updateTheme(i, 'label', e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-24 shrink-0">
              Preview URL
            </label>
            <input
              type="text"
              value={theme.previewImageUrl}
              onChange={(e) =>
                updateTheme(i, 'previewImageUrl', e.target.value)
              }
              className={inputCls}
            />
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          onUpdate({
            themes: [
              ...module.themes,
              { id: '', label: '', previewImageUrl: '' },
            ],
          } as Partial<ModuleConfig>)
        }
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        + Add Theme
      </button>
      {bgSlot}
      <CustomizationSection
        elements={THEME_SELECTION_ELEMENTS}
        customization={module.customization}
        onUpdate={onUpdate}
      />
    </div>
  )
}

function AiGenerationPanel({
  module,
  flow,
  onUpdate,
  onUpdateFlow,
  bgSlot,
  onThemeAssetUpload,
}: {
  module: AiGenerationModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
  onUpdateFlow: (
    updater: (f: Array<ModuleConfig>) => Array<ModuleConfig>,
  ) => void
  bgSlot: ReactNode
  onThemeAssetUpload: (
    themeId: string,
    field: 'frameImageUrl' | 'templateImageUrl' | 'previewImageUrl',
    file: File,
  ) => Promise<void>
}) {
  const [openThemes, setOpenThemes] = useState<Set<number>>(new Set())
  const hasTs = flow.some((m) => m.moduleId === 'theme-selection')

  const inputCls =
    'flex-1 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500'
  const labelCls = 'text-xs text-slate-400 w-28 shrink-0'

  const updateThemeField = (
    i: number,
    field: keyof AiThemeConfig,
    value: string | number,
  ) => {
    onUpdate({
      themes: module.themes.map((t, j) =>
        j === i ? { ...t, [field]: value } : t,
      ),
    } as Partial<ModuleConfig>)
  }

  const renameThemeId = (i: number, oldId: string, newId: string) => {
    onUpdateFlow((f) =>
      f.map((m) => {
        if (m.moduleId === 'ai-generation')
          return {
            ...m,
            themes: m.themes.map((t, j) => (j === i ? { ...t, id: newId } : t)),
          }
        if (m.moduleId === 'theme-selection')
          return {
            ...m,
            themes: m.themes.map((t) =>
              t.id === oldId ? { ...t, id: newId } : t,
            ),
          }
        return m
      }),
    )
  }

  const addTheme = () => {
    onUpdateFlow((f) =>
      f.map((m) => {
        if (m.moduleId === 'ai-generation')
          return { ...m, themes: [...m.themes, { ...BLANK_AI_THEME }] }
        if (m.moduleId === 'theme-selection')
          return {
            ...m,
            themes: [...m.themes, { id: '', label: '', previewImageUrl: '' }],
          }
        return m
      }),
    )
  }

  const removeTheme = (i: number, id: string) => {
    onUpdateFlow((f) =>
      f.map((m) => {
        if (m.moduleId === 'ai-generation')
          return { ...m, themes: m.themes.filter((_, j) => j !== i) }
        if (m.moduleId === 'theme-selection')
          return { ...m, themes: m.themes.filter((t) => t.id !== id) }
        return m
      }),
    )
  }

  const toggleTheme = (i: number) =>
    setOpenThemes((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <div className="space-y-4">
      {/* Provider */}
      <div className="flex items-center gap-2">
        <label className={labelCls}>Provider</label>
        <select
          value={module.provider}
          onChange={(e) =>
            onUpdate({
              provider: e.target.value as 'replicate' | 'google',
            } as Partial<ModuleConfig>)
          }
          className="px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
        >
          <option value="replicate">replicate</option>
          <option value="google">google</option>
        </select>
      </div>

      {/* Themes */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
          Themes
        </p>
        {module.themes.map((theme, i) => (
          <div
            key={i}
            className="border border-slate-700 rounded-lg overflow-hidden"
          >
            {/* Theme header row */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/50">
              <button
                onClick={() => toggleTheme(i)}
                className="flex-1 text-left text-xs text-white font-medium"
              >
                {openThemes.has(i) ? '▼' : '▶'}{' '}
                {theme.id || (
                  <span className="text-slate-500 italic">unnamed</span>
                )}
              </button>
              <button
                onClick={() => removeTheme(i, theme.id)}
                className="text-slate-500 hover:text-red-400 transition-colors text-sm leading-none"
                title="Remove theme"
              >
                ×
              </button>
            </div>

            {/* Theme fields */}
            {openThemes.has(i) && (
              <div className="px-3 pb-3 pt-2 space-y-1.5 border-t border-slate-700">
                {/* ID */}
                <div className="flex items-center gap-2">
                  <label className={labelCls}>ID</label>
                  <input
                    type="text"
                    value={theme.id}
                    onChange={(e) => renameThemeId(i, theme.id, e.target.value)}
                    className={inputCls}
                  />
                </div>
                {/* Text fields */}
                {(
                  [
                    ['label', 'Label'],
                    ['previewImageUrl', 'Preview URL'],
                    ['frameImageUrl', 'Frame URL'],
                    ['templateImageUrl', 'Template URL'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className={labelCls}>{label}</label>
                    <input
                      type="text"
                      value={theme[field]}
                      onChange={(e) =>
                        updateThemeField(i, field, e.target.value)
                      }
                      className={inputCls}
                    />
                  </div>
                ))}
                {/* Prompt textarea */}
                <div className="flex items-start gap-2">
                  <label className={`${labelCls} mt-1`}>Prompt</label>
                  <textarea
                    value={theme.prompt}
                    rows={3}
                    onChange={(e) =>
                      updateThemeField(i, 'prompt', e.target.value)
                    }
                    className="flex-1 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                {/* Number fields */}
                {(
                  [
                    ['canvasWidth', 'Canvas W'],
                    ['canvasHeight', 'Canvas H'],
                    ['photoWidth', 'Photo W'],
                    ['photoHeight', 'Photo H'],
                    ['photoOffsetX', 'Offset X'],
                    ['photoOffsetY', 'Offset Y'],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className={labelCls}>{label}</label>
                    <input
                      type="number"
                      value={theme[field]}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!isNaN(v)) updateThemeField(i, field, v)
                      }}
                      className="w-24 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
                {/* Theme asset uploads */}
                <div className="pt-2 space-y-2">
                  <AssetSlot
                    label="Frame Image"
                    currentUrl={theme.frameImageUrl}
                    onUpload={(file) =>
                      onThemeAssetUpload(theme.id, 'frameImageUrl', file)
                    }
                  />
                  <AssetSlot
                    label="Template Image (AI face-swap source)"
                    currentUrl={theme.templateImageUrl}
                    onUpload={(file) =>
                      onThemeAssetUpload(theme.id, 'templateImageUrl', file)
                    }
                  />
                  <AssetSlot
                    label="Preview Image (theme card)"
                    currentUrl={theme.previewImageUrl}
                    onUpload={(file) =>
                      onThemeAssetUpload(theme.id, 'previewImageUrl', file)
                    }
                  />
                </div>
              </div>
            )}
          </div>
        ))}

        <button
          onClick={addTheme}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Add Theme{hasTs ? ' (syncs to Theme Selection)' : ''}
        </button>
      </div>

      {/* Loading Screen Slideshow */}
      <div className="space-y-2">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">
          Loading Screen Slideshow
        </p>
        <p className="text-xs text-slate-500">
          Images shown while AI generation runs. Leave empty to use the default
          loading animation.
        </p>
        {(module.slideshowItems ?? []).map((item, i) => {
          const items = module.slideshowItems ?? []
          const updateItem = (field: 'imageUrl' | 'caption', value: string) => {
            onUpdate({
              slideshowItems: items.map((it, j) =>
                j === i ? { ...it, [field]: value || undefined } : it,
              ),
            } as Partial<ModuleConfig>)
          }
          const moveItem = (dir: -1 | 1) => {
            const next = [...items]
            const swapIdx = i + dir
            ;[next[i], next[swapIdx]] = [next[swapIdx], next[i]]
            onUpdate({ slideshowItems: next } as Partial<ModuleConfig>)
          }
          return (
            <div
              key={i}
              className="border border-slate-700 rounded p-3 space-y-1.5"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">Item {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveItem(-1)}
                    disabled={i === 0}
                    className="px-1 py-0.5 text-xs text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => moveItem(1)}
                    disabled={i === items.length - 1}
                    className="px-1 py-0.5 text-xs text-slate-400 hover:text-white disabled:text-slate-700 disabled:cursor-not-allowed transition-colors"
                    title="Move down"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() =>
                      onUpdate({
                        slideshowItems: items.filter((_, j) => j !== i),
                      } as Partial<ModuleConfig>)
                    }
                    className="text-slate-500 hover:text-red-400 transition-colors text-sm leading-none ml-1"
                    title="Remove item"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className={labelCls}>Image URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={item.imageUrl ?? ''}
                  onChange={(e) => updateItem('imageUrl', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className={labelCls}>Caption</label>
                <input
                  type="text"
                  placeholder="Optional caption text"
                  value={item.caption ?? ''}
                  onChange={(e) => updateItem('caption', e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
          )
        })}
        <button
          onClick={() =>
            onUpdate({
              slideshowItems: [
                ...(module.slideshowItems ?? []),
                { imageUrl: undefined, caption: undefined },
              ],
            } as Partial<ModuleConfig>)
          }
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          + Add Slideshow Item
        </button>
      </div>

      {bgSlot}
      <CustomizationSection
        elements={AI_GENERATION_ELEMENTS}
        customization={module.customization}
        onUpdate={onUpdate}
      />
    </div>
  )
}

function MiniQuizPanel({
  module,
  onUpdate,
  bgSlot,
}: {
  module: MiniQuizModuleConfig
  onUpdate: (patch: Partial<ModuleConfig>) => void
  bgSlot: ReactNode
}) {
  const inputCls =
    'flex-1 px-2 py-1 text-xs bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500'

  const updateQuestion = (qi: number, text: string) => {
    onUpdate({
      questions: module.questions.map((q, i) =>
        i === qi ? { ...q, text } : q,
      ),
    } as Partial<ModuleConfig>)
  }

  const updateOption = (qi: number, oi: number, value: string) => {
    onUpdate({
      questions: module.questions.map((q, i) =>
        i === qi
          ? { ...q, options: q.options.map((o, j) => (j === oi ? value : o)) }
          : q,
      ),
    } as Partial<ModuleConfig>)
  }

  const addOption = (qi: number) => {
    onUpdate({
      questions: module.questions.map((q, i) =>
        i === qi ? { ...q, options: [...q.options, ''] } : q,
      ),
    } as Partial<ModuleConfig>)
  }

  const removeOption = (qi: number, oi: number) => {
    onUpdate({
      questions: module.questions.map((q, i) =>
        i === qi ? { ...q, options: q.options.filter((_, j) => j !== oi) } : q,
      ),
    } as Partial<ModuleConfig>)
  }

  const removeQuestion = (qi: number) => {
    onUpdate({
      questions: module.questions.filter((_, i) => i !== qi),
    } as Partial<ModuleConfig>)
  }

  const addQuestion = () => {
    onUpdate({
      questions: [...module.questions, { text: '', options: ['', ''] }],
    } as Partial<ModuleConfig>)
  }

  return (
    <div className="space-y-4">
      {module.questions.map((q, qi) => (
        <div
          key={qi}
          className="border border-slate-700 rounded-lg p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Question text"
              value={q.text}
              onChange={(e) => updateQuestion(qi, e.target.value)}
              className={inputCls}
            />
            <button
              onClick={() => removeQuestion(qi)}
              className="text-slate-500 hover:text-red-400 transition-colors text-sm leading-none"
              title="Remove question"
            >
              ×
            </button>
          </div>
          <div className="pl-3 space-y-1.5">
            {q.options.map((opt, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-4 shrink-0">
                  {oi + 1}.
                </span>
                <input
                  type="text"
                  placeholder="Option"
                  value={opt}
                  onChange={(e) => updateOption(qi, oi, e.target.value)}
                  className={inputCls}
                />
                <button
                  onClick={() => removeOption(qi, oi)}
                  disabled={q.options.length <= 2}
                  className="text-slate-500 hover:text-red-400 disabled:text-slate-700 disabled:cursor-not-allowed transition-colors text-sm leading-none"
                  title="Remove option"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => addOption(qi)}
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              + Add option
            </button>
          </div>
        </div>
      ))}
      <button
        onClick={addQuestion}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        + Add Question
      </button>
      {bgSlot}
    </div>
  )
}

function WelcomePanel({
  module,
  onUpdate,
  bgSlot,
}: {
  module: WelcomeModuleConfig
  onUpdate: (patch: Partial<ModuleConfig>) => void
  bgSlot: ReactNode
}) {
  return (
    <div>
      {bgSlot}
      <CustomizationSection
        elements={WELCOME_ELEMENTS}
        customization={module.customization}
        onUpdate={onUpdate}
      />
    </div>
  )
}

function FormPanel({
  module,
  onUpdate,
  bgSlot,
  formFields,
  onFormFieldChange,
}: {
  module: FormModuleConfig
  onUpdate: (patch: Partial<ModuleConfig>) => void
  bgSlot: ReactNode
  formFields: FormFieldsConfig
  onFormFieldChange: (field: keyof FormFieldsConfig, value: boolean) => void
}) {
  const toggleCls = 'flex items-center gap-2 cursor-pointer select-none'
  const checkboxCls = 'w-4 h-4 rounded accent-blue-500'

  return (
    <div className="space-y-4">
      {/* Form field toggles */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          Form Fields
        </p>
        <div className="space-y-2">
          {(Object.keys(formFields) as Array<keyof FormFieldsConfig>).map(
            (field) => (
              <label key={field} className={toggleCls}>
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={formFields[field]}
                  onChange={(e) => onFormFieldChange(field, e.target.checked)}
                />
                <span className="text-sm text-slate-300 capitalize">
                  {field}
                </span>
              </label>
            ),
          )}
        </div>
      </div>
      {bgSlot}
      <CustomizationSection
        elements={FORM_ELEMENTS}
        customization={module.customization}
        onUpdate={onUpdate}
      />
    </div>
  )
}

function ResultPanel({
  module,
  onUpdate,
  bgSlot,
  printerName,
  onPrinterNameChange,
}: {
  module: ResultModuleConfig
  onUpdate: (patch: Partial<ModuleConfig>) => void
  bgSlot: ReactNode
  printerName: string
  onPrinterNameChange: (name: string) => void
}) {
  const toggleCls = 'flex items-center gap-2 cursor-pointer select-none'
  const checkboxCls = 'w-4 h-4 rounded accent-blue-500'

  const update = (
    field: 'emailEnabled' | 'qrCodeEnabled' | 'printEnabled',
    value: boolean,
  ) => onUpdate({ [field]: value } as Partial<ModuleConfig>)

  return (
    <div className="space-y-4">
      {/* Printer name */}
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Printer Name
        </label>
        <input
          type="text"
          value={printerName}
          onChange={(e) => onPrinterNameChange(e.target.value)}
          placeholder="DS-RX1"
          className="w-full px-2 py-1 text-sm bg-slate-900 border border-slate-600 rounded text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      {/* Feature flags */}
      <div>
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          Feature Flags
        </p>
        <div className="space-y-2">
          <label className={toggleCls}>
            <input
              type="checkbox"
              className={checkboxCls}
              checked={module.emailEnabled ?? true}
              onChange={(e) => update('emailEnabled', e.target.checked)}
            />
            <span className="text-sm text-slate-300">Send email to guest</span>
          </label>
          <label className={toggleCls}>
            <input
              type="checkbox"
              className={checkboxCls}
              checked={module.qrCodeEnabled ?? true}
              onChange={(e) => update('qrCodeEnabled', e.target.checked)}
            />
            <span className="text-sm text-slate-300">Show QR code</span>
          </label>
          <label className={toggleCls}>
            <input
              type="checkbox"
              className={checkboxCls}
              checked={module.printEnabled ?? true}
              onChange={(e) => update('printEnabled', e.target.checked)}
            />
            <span className="text-sm text-slate-300">Enable printing</span>
          </label>
        </div>
      </div>
      {bgSlot}
      <CustomizationSection
        elements={RESULT_ELEMENTS}
        customization={module.customization}
        onUpdate={onUpdate}
      />
    </div>
  )
}
