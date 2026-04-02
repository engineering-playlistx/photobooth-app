import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import type { EventConfig } from '../../types/event-config'
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

function FlowBuilderPage() {
  const initialFlow = Route.useLoaderData()
  const { eventId } = Route.useParams()
  const [flow, setFlow] = useState<Array<ModuleConfig>>(initialFlow)

  const isDirty = JSON.stringify(flow) !== JSON.stringify(initialFlow)

  const canMoveUp = (i: number) =>
    !isFixed(flow[i]) && i > 0 && !isFixed(flow[i - 1])

  const canMoveDown = (i: number) =>
    !isFixed(flow[i]) && i < flow.length - 1 && !isFixed(flow[i + 1])

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

      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Flow Builder</h1>
        {isDirty && (
          <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2.5 py-1 rounded-full">
            Unsaved changes
          </span>
        )}
      </div>

      <ol className="space-y-3">
        {flow.map((module, index) => (
          <li key={`${module.moduleId}-${index}`}>
            <ModuleCard
              module={module}
              position={index + 1}
              canMoveUp={canMoveUp(index)}
              canMoveDown={canMoveDown(index)}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onRemove={() => removeModule(index)}
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
  position,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  module: ModuleConfig
  position: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}) {
  const fixed = isFixed(module)
  const label = MODULE_LABELS[module.moduleId] ?? module.moduleId

  return (
    <div
      className={`flex items-center gap-4 p-4 rounded-lg border ${
        fixed
          ? 'bg-slate-800/30 border-slate-700/50'
          : 'bg-slate-800/50 border-slate-700'
      }`}
    >
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

      {fixed ? (
        <span
          className="text-slate-500 shrink-0"
          title="Fixed — cannot be moved or removed"
        >
          🔒
        </span>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
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
        </div>
      )}
    </div>
  )
}
