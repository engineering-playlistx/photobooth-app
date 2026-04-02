import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import { validateModuleFlow } from '../../utils/validate-module-flow'
import type { AiThemeConfig, EventConfig } from '../../types/event-config'
import type {
  AiGenerationModuleConfig,
  FormModuleConfig,
  MiniQuizModuleConfig,
  ModuleConfig,
  ThemeSelectionModuleConfig,
} from '../../types/module-config'

const getModuleFlow = createServerFn({ method: 'GET' }).handler(async (ctx) => {
  const { eventId } = ctx.data as { eventId: string }
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('event_configs')
    .select('config_json')
    .eq('event_id', eventId)
    .single()
  if (error) throw new Error(error.message)
  return (data.config_json as EventConfig).moduleFlow
})

const saveModuleFlow = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, moduleFlow } = ctx.data as {
      eventId: string
      moduleFlow: Array<ModuleConfig>
    }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()
    if (error) throw new Error(error.message)
    const merged = { ...(data.config_json as EventConfig), moduleFlow }
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
      await getModuleFlow({ data: { eventId: params.eventId } }),
    component: FlowBuilderPage,
  },
)

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

function FlowBuilderPage() {
  const initialFlow = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const [flow, setFlow] = useState<Array<ModuleConfig>>(initialFlow)
  const [savedFlow, setSavedFlow] = useState<Array<ModuleConfig>>(initialFlow)
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({})
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  const isDirty = JSON.stringify(flow) !== JSON.stringify(savedFlow)

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
      await saveModuleFlow({ data: { eventId, moduleFlow: flow } })
      setSavedFlow(flow)
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
}: {
  module: ModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
  onUpdateFlow: (
    updater: (f: Array<ModuleConfig>) => Array<ModuleConfig>,
  ) => void
}) {
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
      </div>
    )
  }
  if (module.moduleId === 'theme-selection') {
    return (
      <ThemeSelectionPanel module={module} flow={flow} onUpdate={onUpdate} />
    )
  }
  if (module.moduleId === 'ai-generation') {
    return (
      <AiGenerationPanel
        module={module}
        flow={flow}
        onUpdate={onUpdate}
        onUpdateFlow={onUpdateFlow}
      />
    )
  }
  if (module.moduleId === 'mini-quiz') {
    return <MiniQuizPanel module={module} onUpdate={onUpdate} />
  }
  return (
    <p className="text-xs text-slate-500">No configurable options for V2.</p>
  )
}

function ThemeSelectionPanel({
  module,
  flow,
  onUpdate,
}: {
  module: ThemeSelectionModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
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
    </div>
  )
}

function AiGenerationPanel({
  module,
  flow,
  onUpdate,
  onUpdateFlow,
}: {
  module: AiGenerationModuleConfig
  flow: Array<ModuleConfig>
  onUpdate: (patch: Partial<ModuleConfig>) => void
  onUpdateFlow: (
    updater: (f: Array<ModuleConfig>) => Array<ModuleConfig>,
  ) => void
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
    </div>
  )
}

function MiniQuizPanel({
  module,
  onUpdate,
}: {
  module: MiniQuizModuleConfig
  onUpdate: (patch: Partial<ModuleConfig>) => void
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
    </div>
  )
}
