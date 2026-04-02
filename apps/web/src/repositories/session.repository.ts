import { getSupabaseAdminClient } from '../utils/supabase-admin'

export interface CreateSessionData {
  id: string
  eventId: string
  photoPath: string
  userInfo: { name: string; email: string; phone: string }
}

export interface CompleteSessionData {
  photoPath: string
  userInfo: { name: string; email: string; phone: string }
  moduleOutputs: Record<string, unknown>
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

  async completeSession(
    sessionId: string,
    data: CompleteSessionData,
  ): Promise<void> {
    const supabase = getSupabaseAdminClient()

    const { error } = await supabase
      .from('sessions')
      .update({
        photo_path: data.photoPath,
        user_info: data.userInfo,
        module_outputs: data.moduleOutputs,
        status: 'completed',
      })
      .eq('id', sessionId)

    if (error) {
      throw new Error(`Failed to complete session: ${error.message}`)
    }
  }

  async startSession(eventId: string): Promise<{ sessionId: string }> {
    const supabase = getSupabaseAdminClient()
    const id = crypto.randomUUID()

    const { error } = await supabase.from('sessions').insert({
      id,
      event_id: eventId,
      status: 'in_progress',
    })

    if (error) {
      throw new Error(`Failed to start session: ${error.message}`)
    }

    return { sessionId: id }
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
