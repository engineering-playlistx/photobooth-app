import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { SubmitPhotoUseCase } from '../usecases/submit-photo.usecase'

interface RequestBody {
  photoPath: string
  name: string
  email: string
  phone: string
  selectedTheme?: string
  eventId: string
  sessionId?: string
  moduleOutputs?: Record<string, unknown>
}

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('Authorization')

  if (!apiKey) {
    console.error({ message: 'Missing Authorization header' })
    return false
  }

  if (!apiKey.startsWith('Bearer ')) {
    console.error({ message: 'Authorization header must start with "Bearer "' })
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

function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/[<>]/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '') // eslint-disable-line no-control-regex
    .slice(0, 100)
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return emailRegex.test(email)
}

function validatePhone(phone: string): boolean {
  const indonesiaPhoneRegex = /^(\+62|62|0)[0-9-]{9,15}$/
  return indonesiaPhoneRegex.test(phone.replace(/\s/g, ''))
}

function standardizePhone(phone: string): string {
  return phone
    .replace(/[\s-]/g, '')
    .replace(/^0/, '62')
    .replace(/^62/, '+62')
    .replace(/^(\+62)/, '$1')
}

export const Route = createFileRoute('/api/photo')({
  server: {
    handlers: {
      POST: async (ctx) => {
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json()) as RequestBody

          if (
            !body.photoPath ||
            !body.name ||
            !body.email ||
            !body.phone ||
            !body.eventId
          ) {
            return json({ error: 'Missing required fields' }, { status: 400 })
          }

          const sanitizedName = sanitizeName(body.name)
          if (!sanitizedName) {
            return json({ error: 'Invalid name' }, { status: 400 })
          }

          if (body.email.length > 254 || body.phone.length > 20) {
            return json({ error: 'Invalid input' }, { status: 400 })
          }

          if (!validateEmail(body.email)) {
            return json({ error: 'Invalid email format' }, { status: 400 })
          }

          if (!validatePhone(body.phone)) {
            return json(
              {
                error:
                  'Invalid phone number format. Please use Indonesian mobile format',
              },
              { status: 400 },
            )
          }

          const standardizedPhone = standardizePhone(body.phone)

          if (!standardizedPhone) {
            return json(
              { error: 'Invalid phone number format' },
              { status: 400 },
            )
          }

          const submitPhotoUseCase = new SubmitPhotoUseCase()
          const result = await submitPhotoUseCase.execute({
            photoPath: body.photoPath,
            name: sanitizedName,
            email: body.email,
            phone: standardizedPhone,
            selectedTheme: body.selectedTheme,
            eventId: body.eventId,
            sessionId: body.sessionId,
            moduleOutputs: body.moduleOutputs,
          })

          return json({
            message: 'Photo saved successfully',
            photoUrl: result.photoUrl,
            sessionId: result.sessionId,
          })
        } catch (error) {
          console.error({ message: 'API error', error })

          if (error instanceof Error) {
            if (error.message.includes('failed to send email')) {
              return json(
                { error: 'Photo uploaded but failed to send email' },
                { status: 500 },
              )
            }

            return json({ error: error.message }, { status: 500 })
          }

          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
