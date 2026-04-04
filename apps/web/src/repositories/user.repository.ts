import { getSupabaseAdminClient } from '../utils/supabase-admin'

export interface CreateUserData {
  name: string
  email: string
  phone: string
  photoPath: string
  selectedTheme?: string
  eventId?: string
}

export interface User {
  id: string
  name: string
  email: string
  phone: string
  photo_path: string
  selected_theme: string | null
  created_at: string
  visit_count: number
}

export class UserRepository {
  async createUser(data: CreateUserData): Promise<User> {
    const supabase = getSupabaseAdminClient()

    const { data: user, error } = await supabase
      .rpc('upsert_user_with_visit_count', {
        p_name: data.name,
        p_email: data.email,
        p_phone: data.phone,
        p_photo_path: data.photoPath,
        p_selected_theme: data.selectedTheme ?? null,
        p_event_id: data.eventId ?? null,
      })
      .single()

    if (error) {
      throw new Error(`Failed to create user: ${error.message}`)
    }

    if (!user) {
      throw new Error('Failed to create user: No data returned')
    }

    return user
  }
}
