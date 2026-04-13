import React, { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../../utils/supabase-admin'
import type { Organization } from '@photobooth/types'

type OrgWithEventCount = Organization & { eventCount: number }

const getOrganizationsWithCounts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .select('id, name, slug, created_at, events(count)')
      .order('name', { ascending: true })
    if (error) throw new Error(error.message)
    return data.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdAt: row.created_at,
      eventCount:
        (row.events as unknown as Array<{ count: number }>)[0]?.count ?? 0,
    })) as Array<OrgWithEventCount>
  },
)

const createOrganization = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { name, slug } = ctx.data as { name: string; slug: string }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .insert({ name, slug })
      .select('id, name, slug, created_at')
      .single()
    if (error) throw new Error(error.message)
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      createdAt: data.created_at,
    } as Organization
  },
)

const updateOrganization = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { id, name, slug } = ctx.data as {
      id: string
      name: string
      slug: string
    }
    const admin = getSupabaseAdminClient()
    const { data, error } = await admin
      .from('organizations')
      .update({ name, slug })
      .eq('id', id)
      .select('id, name, slug, created_at')
      .single()
    if (error) throw new Error(error.message)
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      createdAt: data.created_at,
    } as Organization
  },
)

export const Route = createFileRoute('/dashboard/_layout/organizations')({
  loader: async () => await getOrganizationsWithCounts(),
  component: OrganizationsPage,
})

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

type FormMode = { type: 'create' } | { type: 'edit'; org: OrgWithEventCount }

function OrganizationsPage() {
  const orgs = Route.useLoaderData()
  const router = useRouter()

  const [formMode, setFormMode] = useState<FormMode | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')

  const openCreate = () => {
    setFormMode({ type: 'create' })
    setName('')
    setSlug('')
    setFormError(null)
  }

  const openEdit = (org: OrgWithEventCount) => {
    setFormMode({ type: 'edit', org })
    setName(org.name)
    setSlug(org.slug)
    setFormError(null)
  }

  const handleClose = () => {
    setFormMode(null)
    setFormError(null)
  }

  const handleNameChange = (value: string) => {
    setName(value)
    if (formMode?.type === 'create') {
      setSlug(slugify(value))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setFormError('Name is required.')
      return
    }
    if (!slug.trim()) {
      setFormError('Slug is required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      if (formMode?.type === 'create') {
        await createOrganization({
          data: { name: name.trim(), slug: slug.trim() },
        })
      } else if (formMode?.type === 'edit') {
        await updateOrganization({
          data: { id: formMode.org.id, name: name.trim(), slug: slug.trim() },
        })
      }
      handleClose()
      void router.invalidate()
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save organization.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Organizations</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
        >
          + New Organization
        </button>
      </div>

      {formMode && (
        <div className="mb-6 rounded-lg border border-slate-700 bg-slate-800 p-5">
          <h2 className="text-lg font-semibold text-white mb-4">
            {formMode.type === 'create'
              ? 'New Organization'
              : `Edit — ${formMode.org.name}`}
          </h2>
          <form
            onSubmit={(e) => {
              void handleSubmit(e)
            }}
            className="flex flex-col gap-4"
          >
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Shell Racing"
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Slug <span className="text-red-400">*</span>
                <span className="ml-2 text-slate-500 font-normal">
                  (URL-safe, must be unique)
                </span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="shell-racing"
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none font-mono"
              />
            </div>
            {formError && <p className="text-sm text-red-400">{formError}</p>}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                {submitting
                  ? 'Saving…'
                  : formMode.type === 'create'
                    ? 'Create'
                    : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {orgs.length === 0 ? (
        <p className="text-slate-400">No organizations yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Events
                </th>
                <th className="px-4 py-3 text-left text-slate-400 font-medium">
                  Created
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {orgs.map((org) => (
                <tr
                  key={org.id}
                  className="bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-white font-medium">
                    {org.name}
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono">
                    {org.slug}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{org.eventCount}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {org.createdAt.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(org)}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Edit
                    </button>
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
