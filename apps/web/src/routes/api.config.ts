import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import type { EventConfig } from '../types/event-config'

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('Authorization')
  if (!apiKey || !apiKey.startsWith('Bearer ')) {
    return false
  }
  const providedKey = apiKey.split(' ')[1]
  const expectedKey = process.env.API_CLIENT_KEY
  if (!expectedKey || providedKey !== expectedKey) {
    return false
  }
  return true
}

export const Route = createFileRoute('/api/config')({
  server: {
    handlers: {
      GET: async (ctx) => {
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const url = new URL(request.url)
          const eventId = url.searchParams.get('eventId')

          if (!eventId) {
            return json(
              { error: 'Missing required query param: eventId' },
              { status: 400 },
            )
          }

          const supabase = getSupabaseAdminClient()
          const { data, error } = await supabase
            .from('event_configs')
            .select('config_json')
            .eq('event_id', eventId)
            .single()

          if (error) {
            // PGRST116 = "no rows returned" from .single()
            if (error.code === 'PGRST116') {
              return json(
                { error: `Event config not found for eventId: ${eventId}` },
                { status: 404 },
              )
            }
            return json({ error: error.message }, { status: 500 })
          }

          return json(data.config_json as EventConfig)
        } catch (error) {
          console.error({ message: 'Config fetch error', error })
          if (error instanceof Error) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
