import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import type { EventConfig } from '../../types/event-config'
import type { ModuleConfig } from '../../types/module-config'

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

const POSITION_LABELS: Record<string, string> = {
  'fixed-first': 'fixed-first',
  'pre-photo': 'pre-photo',
  'fixed-camera': 'fixed-camera',
  'post-photo': 'post-photo',
  'fixed-last': 'fixed-last',
  flexible: 'flexible',
}

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
            />
          </li>
        ))}
      </ol>
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
}: {
  module: ModuleConfig
  position: number
  canMoveUp: boolean
  canMoveDown: boolean
  onMoveUp: () => void
  onMoveDown: () => void
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
        <div className="flex flex-col gap-0.5 shrink-0">
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
      )}
    </div>
  )
}
