import React, { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import type { Organization } from '@photobooth/types'

type Event = {
  id: string
  name: string
  status: string
  created_at: string
  organization_id: string
  organizations: { name: string } | null
}

const getEvents = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('events')
    .select(
      'id, name, status, created_at, organization_id, organizations(name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data as Array<Event>
})

const getOrganizations = createServerFn({ method: 'GET' }).handler(async () => {
  const admin = getSupabaseAdminClient()
  const { data, error } = await admin
    .from('organizations')
    .select('id, name, slug, created_at')
    .order('name', { ascending: true })
  if (error) throw new Error(error.message)
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
  })) as Array<Organization>
})

const createEvent = createServerFn({ method: 'POST' }).handler(async (ctx) => {
  const { name, organizationId, status } = ctx.data as {
    name: string
    organizationId: string
    status: 'draft' | 'active'
  }
  const admin = getSupabaseAdminClient()
  const id = `evt_${Date.now()}`
  const { data, error } = await admin
    .from('events')
    .insert({ id, name, organization_id: organizationId, status })
    .select(
      'id, name, status, created_at, organization_id, organizations(name)',
    )
    .single()
  if (error) throw new Error(error.message)

  // TASK-0.1: Seed a default event_configs row so config/flow pages don't 500 on first load.
  // Note: if this insert fails after the events insert succeeds, the event row is orphaned.
  // The operator can recover via the TASK-0.2 repair migration. Accepted at risk tolerance 2/5.
  const defaultConfig = {
    eventId: id,
    branding: {
      logoUrl: null,
      primaryColor: '#ffffff',
      secondaryColor: '#000000',
      fontFamily: null,
      backgroundUrl: null,
      portalHeading: null,
      screenBackgrounds: null,
    },
    moduleFlow: [
      { moduleId: 'welcome', position: 'fixed-first' },
      {
        moduleId: 'camera',
        position: 'fixed-camera',
        outputKey: 'originalPhoto',
        maxRetakes: 2,
      },
      { moduleId: 'result', position: 'fixed-last' },
    ],
    formFields: { name: true, email: true, phone: true, consent: true },
    techConfig: {
      printerName: '',
      inactivityTimeoutSeconds: 60,
      guestPortalEnabled: false,
    },
  }
  const { error: configError } = await admin
    .from('event_configs')
    .insert({ event_id: id, config_json: defaultConfig })
  if (configError) throw new Error(configError.message)

  return data as Event
})

export const Route = createFileRoute('/dashboard/_layout/')({
  loader: async () => {
    const [events, organizations] = await Promise.all([
      getEvents(),
      getOrganizations(),
    ])
    return { events, organizations }
  },
  component: EventListPage,
})

function EventListPage() {
  const { events, organizations } = Route.useLoaderData()
  const router = useRouter()

  const [orgFilter, setOrgFilter] = useState<string>('all')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newOrgId, setNewOrgId] = useState('')

  const filtered =
    orgFilter === 'all'
      ? events
      : events.filter((e) => e.organization_id === orgFilter)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) {
      setCreateError('Name is required.')
      return
    }
    if (!newOrgId) {
      setCreateError('Organization is required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      await createEvent({
        data: {
          name: newName.trim(),
          organizationId: newOrgId,
          status: 'draft',
        },
      })
      setShowCreateForm(false)
      setNewName('')
      setNewOrgId('')
      void router.invalidate()
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Failed to create event.',
      )
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Events</h1>
        <button
          onClick={() => {
            setShowCreateForm(true)
            setCreateError(null)
          }}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          + New Event
        </button>
      </div>

      {showCreateForm && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">New Event</h2>
          <form
            onSubmit={(e) => {
              void handleCreate(e)
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Shell Racing 2026"
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Organization <span className="text-red-400">*</span>
              </label>
              <select
                value={newOrgId}
                onChange={(e) => setNewOrgId(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select organization…</option>
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            {createError && (
              <p className="text-sm text-red-400">{createError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {creating ? 'Creating…' : 'Create Event'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-slate-400">Organization:</label>
        <select
          value={orgFilter}
          onChange={(e) => setOrgFilter(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="all">All organizations</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-slate-400">No events found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Organization
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filtered.map((event) => (
                <tr
                  key={event.id}
                  className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {event.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 text-xs rounded-full border bg-blue-500/10 text-blue-300 border-blue-500/20">
                      {event.organizations?.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {event.created_at.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to="/dashboard/events/$eventId"
                      params={{ eventId: event.id }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
