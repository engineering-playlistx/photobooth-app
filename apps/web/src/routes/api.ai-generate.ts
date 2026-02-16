import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { AIGenerationService } from '../services/ai-generation.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import type { RacingTheme } from '../services/ai-generation.service'

const VALID_THEMES: Array<RacingTheme> = ['pitcrew', 'motogp', 'f1']
const SUPABASE_BUCKET = 'photobooth-bucket'

interface RequestBody {
  userPhotoBase64: string
  theme: RacingTheme
}

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

export const Route = createFileRoute('/api/ai-generate')({
  server: {
    handlers: {
      POST: async (ctx) => {
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json()) as Partial<RequestBody>

          if (!body.userPhotoBase64 || !body.theme) {
            return json(
              { error: 'Missing required fields: userPhotoBase64 and theme' },
              { status: 400 },
            )
          }

          const userPhotoBase64 = body.userPhotoBase64
          const theme = body.theme
          const requestStart = Date.now()

          console.log(`[ai-generate] Request received — theme: ${theme}`)
          console.log(
            `[ai-generate] Photo payload size: ${Math.round(userPhotoBase64.length / 1024)}KB`,
          )

          if (!VALID_THEMES.includes(theme)) {
            return json(
              {
                error: `Invalid theme. Must be one of: ${VALID_THEMES.join(', ')}`,
              },
              { status: 400 },
            )
          }

          console.log(`[ai-generate] Uploading photo to Supabase temp storage`)
          const supabase = getSupabaseAdminClient()
          const photoId = crypto.randomUUID()
          const tempPath = `temp/${photoId}.png`

          const base64Match = userPhotoBase64.match(
            /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/,
          )

          let photoBuffer: Uint8Array
          let contentType: string

          if (base64Match) {
            contentType = base64Match[1]
            const raw = atob(base64Match[2])
            photoBuffer = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i++) {
              photoBuffer[i] = raw.charCodeAt(i)
            }
          } else {
            // Assume raw base64 without data URI prefix
            contentType = 'image/png'
            const raw = atob(userPhotoBase64)
            photoBuffer = new Uint8Array(raw.length)
            for (let i = 0; i < raw.length; i++) {
              photoBuffer[i] = raw.charCodeAt(i)
            }
          }

          const { error: uploadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .upload(tempPath, photoBuffer, {
              contentType,
              upsert: true,
            })

          if (uploadError) {
            console.error('Failed to upload temp photo:', uploadError)
            return json(
              { error: 'Failed to upload photo for processing' },
              { status: 500 },
            )
          }

          const {
            data: { publicUrl: userPhotoUrl },
          } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(tempPath)

          console.log(`[ai-generate] Temp photo URL: ${userPhotoUrl}`)
          console.log(`[ai-generate] Creating async prediction...`)

          const aiService = new AIGenerationService()
          const predictionId = await aiService.createPrediction({
            userPhotoUrl,
            theme,
          })

          const elapsed = ((Date.now() - requestStart) / 1000).toFixed(1)
          console.log(
            `[ai-generate] Prediction created in ${elapsed}s — id: ${predictionId}, tempPath: ${tempPath}`,
          )

          return json({ predictionId, tempPath })
        } catch (error) {
          console.error({ message: 'AI generation error', error })

          if (error instanceof Error) {
            return json({ error: error.message }, { status: 500 })
          }

          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
