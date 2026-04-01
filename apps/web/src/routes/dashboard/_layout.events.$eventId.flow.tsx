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
  const flow = Route.useLoaderData()
  const { eventId } = Route.useParams()

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
      </div>

      <ol className="space-y-3">
        {flow.map((module, index) => (
          <li key={`${module.moduleId}-${index}`}>
            <ModuleCard module={module} position={index + 1} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function ModuleCard({
  module,
  position,
}: {
  module: ModuleConfig
  position: number
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

      {fixed && (
        <span
          className="text-slate-500 shrink-0"
          title="Fixed — cannot be moved or removed"
        >
          🔒
        </span>
      )}
    </div>
  )
}
