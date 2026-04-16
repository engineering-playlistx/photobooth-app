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
      fontUrl: null,
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

const updateEvent = createServerFn({ method: 'POST' }).handler(async (ctx) => {
  const { id, name } = ctx.data as { id: string; name: string }
  const admin = getSupabaseAdminClient()
  const { error } = await admin.from('events').update({ name }).eq('id', id)
  if (error) throw new Error(error.message)
})

const deleteEvent = createServerFn({ method: 'POST' }).handler(async (ctx) => {
  const { id } = ctx.data as { id: string }
  const admin = getSupabaseAdminClient()
  // Delete dependent rows first — event_configs and sessions have FK constraints with no CASCADE
  const { error: configError } = await admin
    .from('event_configs')
    .delete()
    .eq('event_id', id)
  if (configError) throw new Error(configError.message)
  const { error: sessionsError } = await admin
    .from('sessions')
    .delete()
    .eq('event_id', id)
  if (sessionsError) throw new Error(sessionsError.message)
  // users.event_id has no FK constraint — rows become orphaned (acceptable)
  const { error } = await admin.from('events').delete().eq('id', id)
  if (error) throw new Error(error.message)
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

  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [editName, setEditName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<Event | null>(
    null,
  )
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!confirmDeleteEvent) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteEvent({ data: { id: confirmDeleteEvent.id } })
      setConfirmDeleteEvent(null)
      void router.invalidate()
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete event.',
      )
    } finally {
      setDeleting(false)
    }
  }

  const openRename = (event: Event) => {
    setEditingEvent(event)
    setEditName(event.name)
    setEditError(null)
  }

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editName.trim()) {
      setEditError('Name is required.')
      return
    }
    if (!editingEvent) return
    setEditSaving(true)
    setEditError(null)
    try {
      await updateEvent({
        data: { id: editingEvent.id, name: editName.trim() },
      })
      setEditingEvent(null)
      void router.invalidate()
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to rename event.',
      )
    } finally {
      setEditSaving(false)
    }
  }

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

      {editingEvent && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">
            Rename — {editingEvent.name}
          </h2>
          <form
            onSubmit={(e) => {
              void handleRename(e)
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                New name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            </div>
            {editError && <p className="text-sm text-red-400">{editError}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={editSaving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setEditingEvent(null)}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmDeleteEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-sm w-full mx-4">
            <h2 className="text-lg font-semibold text-white mb-2">
              Delete event?
            </h2>
            <p className="text-sm text-slate-400 mb-4">
              Are you sure you want to delete{' '}
              <span className="text-white font-medium">
                {confirmDeleteEvent.name}
              </span>
              ? This cannot be undone.
            </p>
            {deleteError && (
              <p className="text-sm text-red-400 mb-4">{deleteError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  void handleDelete()
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
              <button
                onClick={() => {
                  setConfirmDeleteEvent(null)
                  setDeleteError(null)
                }}
                disabled={deleting}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
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
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => openRename(event)}
                        className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDeleteEvent(event)
                          setDeleteError(null)
                        }}
                        className="text-sm text-red-400 hover:text-red-300 transition-colors"
                      >
                        Delete
                      </button>
                      <Link
                        to="/dashboard/events/$eventId"
                        params={{ eventId: event.id }}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        View →
                      </Link>
                    </div>
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
