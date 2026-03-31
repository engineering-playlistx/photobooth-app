import {
  Outlet,
  createFileRoute,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseServerClient } from '../../utils/supabase'

const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { user }
})

const signOut = createServerFn({ method: 'POST' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  await supabase.auth.signOut()
})

export const Route = createFileRoute('/dashboard/_layout')({
  beforeLoad: async () => {
    const { user } = await getSession()
    if (!user) throw redirect({ to: '/dashboard/login' })
    return { user }
  },
  component: DashboardLayout,
})

function DashboardLayout() {
  const { user } = Route.useRouteContext()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    void router.navigate({ to: '/dashboard/login' })
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800">
        <span className="text-white font-semibold">Photobooth Dashboard</span>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">{user.email}</span>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
