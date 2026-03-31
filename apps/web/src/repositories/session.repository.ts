import { getSupabaseAdminClient } from '../utils/supabase-admin'

export interface CreateSessionData {
  id: string
  eventId: string
  photoPath: string
  userInfo: { name: string; email: string; phone: string }
}

export class SessionRepository {
  async createSession(data: CreateSessionData): Promise<void> {
    const supabase = getSupabaseAdminClient()

    const { error } = await supabase.from('sessions').insert({
      id: data.id,
      event_id: data.eventId,
      photo_path: data.photoPath,
      user_info: data.userInfo,
    })

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`)
    }
  }

  async getSession(id: string): Promise<{
    id: string
    event_id: string
    photo_path: string | null
    user_info: { name: string; email: string; phone: string } | null
    created_at: string
  } | null> {
    const supabase = getSupabaseAdminClient()

    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // not found
      throw new Error(`Failed to get session: ${error.message}`)
    }

    return data
  }
}
