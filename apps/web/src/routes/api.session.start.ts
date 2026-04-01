import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { SessionRepository } from '../repositories/session.repository'

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('Authorization')

  if (!apiKey) {
    console.error({ message: 'Missing Authorization header' })
    return false
  }

  if (!apiKey.startsWith('Bearer ')) {
    console.error({ message: `Authorization header must start with 'Bearer '` })
    return false
  }

  const providedKey = apiKey.split(' ')[1]
  const expectedKey = process.env.API_CLIENT_KEY

  if (!expectedKey) {
    console.error({ message: 'API_CLIENT_KEY environment variable is not set' })
    return false
  }

  if (providedKey !== expectedKey) {
    console.error({
      message: 'API key mismatch - provided key does not match expected key',
    })
    return false
  }

  return true
}

export const Route = createFileRoute('/api/session/start')({
  server: {
    handlers: {
      POST: async (ctx) => {
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json()) as { eventId?: string }

          if (!body.eventId || body.eventId.trim() === '') {
            return json(
              { error: 'Missing required field: eventId' },
              { status: 400 },
            )
          }

          const sessionRepository = new SessionRepository()
          const result = await sessionRepository.startSession(body.eventId)

          return json({ sessionId: result.sessionId })
        } catch (error) {
          console.error({ message: 'Failed to start session', error })
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Internal server error',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
