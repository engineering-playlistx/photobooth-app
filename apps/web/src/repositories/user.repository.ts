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
}

export class UserRepository {
  async createUser(data: CreateUserData): Promise<User> {
    const supabase = getSupabaseAdminClient()

    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        {
          name: data.name,
          email: data.email,
          phone: data.phone,
          photo_path: data.photoPath,
          selected_theme: data.selectedTheme ?? null,
          event_id: data.eventId ?? null,
        },
        { onConflict: 'email,event_id' },
      )
      .select()
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
