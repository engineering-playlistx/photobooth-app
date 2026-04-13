import { getSupabaseAdminClient } from '../utils/supabase-admin'
import type { Organization } from '@photobooth/types'

function toOrganization(row: {
  id: string
  name: string
  slug: string
  created_at: string
}): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
  }
}

export class OrganizationRepository {
  async findAll(): Promise<Array<Organization>> {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .order('name', { ascending: true })
    if (error)
      throw new Error(`Failed to fetch organizations: ${error.message}`)
    return data.map(toOrganization)
  }

  async findById(id: string): Promise<Organization | null> {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .eq('id', id)
      .single()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to fetch organization: ${error.message}`)
    }
    return toOrganization(data)
  }

  async create(input: { name: string; slug: string }): Promise<Organization> {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .insert({ name: input.name, slug: input.slug })
      .select('id, name, slug, created_at')
      .single()
    if (error)
      throw new Error(`Failed to create organization: ${error.message}`)
    return toOrganization(data)
  }

  async update(
    id: string,
    input: { name?: string; slug?: string },
  ): Promise<Organization> {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('organizations')
      .update(input)
      .eq('id', id)
      .select('id, name, slug, created_at')
      .single()
    if (error)
      throw new Error(`Failed to update organization: ${error.message}`)
    return toOrganization(data)
  }
}
