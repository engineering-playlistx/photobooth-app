import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { AIGenerationService } from '../services/ai-generation.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../utils/constants'
import type { AiGenerationModuleConfig, EventConfig } from '@photobooth/types'

interface RequestBody {
  userPhotoBase64: string
  theme: string
  eventId: string
}

type ResolvedThemeConfig =
  | {
      ok: true
      provider: 'replicate' | 'google'
      templateUrl: string
      prompt: string
    }
  | { ok: false; status: number; error: string }

async function resolveThemeConfig(
  eventId: string,
  theme: string,
): Promise<ResolvedThemeConfig> {
  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()

    if (error) {
      return {
        ok: false,
        status: 503,
        error: `Event config not found for eventId: ${eventId}`,
      }
    }

    const config = data.config_json as EventConfig
    const aiModule = config.moduleFlow.find(
      (m): m is AiGenerationModuleConfig => m.moduleId === 'ai-generation',
    )

    if (!aiModule) {
      return {
        ok: false,
        status: 503,
        error: `No ai-generation module configured for event: ${eventId}`,
      }
    }

    const themeConfig = aiModule.themes.find((t) => t.id === theme)

    if (!themeConfig) {
      return {
        ok: false,
        status: 400,
        error: `Theme '${theme}' not found in event config for: ${eventId}`,
      }
    }

    return {
      ok: true,
      provider: aiModule.provider,
      templateUrl: themeConfig.templateImageUrl,
      prompt: themeConfig.prompt,
    }
  } catch (err) {
    console.error('[ai-generate] Failed to fetch event config:', err)
    return {
      ok: false,
      status: 503,
      error: 'Failed to load event configuration',
    }
  }
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
        let tempPath = ''
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = (await request.json()) as Partial<RequestBody>

          if (!body.userPhotoBase64 || !body.theme || !body.eventId) {
            return json(
              {
                error:
                  'Missing required fields: userPhotoBase64, theme, and eventId',
              },
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

          const themeConfig = await resolveThemeConfig(body.eventId, theme)
          if (!themeConfig.ok) {
            return json(
              { error: themeConfig.error },
              { status: themeConfig.status },
            )
          }
          const { provider, templateUrl, prompt } = themeConfig

          console.log(
            `[ai-generate] Using event config — eventId: ${body.eventId}, provider: ${provider}`,
          )

          const aiService = new AIGenerationService(provider)
          let predictionId: string

          if (provider === 'google') {
            // Google AI: create an async job (stored in ai_jobs), return immediately.
            // The frontend polls /api/ai-generate-status until the job completes,
            // giving a smooth progress bar instead of a blocking 30–60s request.
            console.log(
              `[ai-generate] Using Google AI provider — async job mode`,
            )
            predictionId = await aiService.createPrediction({
              userPhotoUrl: '',
              userPhotoBase64,
              theme,
              templateUrl,
              prompt,
            })
          } else {
            // Replicate: upload to Supabase to get a public URL, then pass to model
            console.log(
              `[ai-generate] Uploading photo to Supabase temp storage`,
            )
            const supabase = getSupabaseAdminClient()
            const photoId = crypto.randomUUID()
            tempPath = `temp/${photoId}.png`

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

            predictionId = await aiService.createPrediction({
              userPhotoUrl,
              theme,
              templateUrl,
              prompt,
            })
          }

          const elapsed = ((Date.now() - requestStart) / 1000).toFixed(1)
          console.log(
            `[ai-generate] Prediction created in ${elapsed}s — id: ${predictionId}, tempPath: ${tempPath}`,
          )

          return json({ predictionId, tempPath, provider })
        } catch (error) {
          console.error({ message: 'AI generation error', error })

          if (tempPath) {
            try {
              const supabase = getSupabaseAdminClient()
              await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])
            } catch (cleanupErr) {
              console.error(
                '[ai-generate] Failed to clean up temp photo after error:',
                cleanupErr,
              )
            }
          }

          if (error instanceof Error) {
            const msg = error.message.toLowerCase()
            const isProviderOverload =
              error.message.includes('503') ||
              msg.includes('overloaded') ||
              msg.includes('high demand') ||
              msg.includes('resource_exhausted') ||
              msg.includes('too many requests')
            if (isProviderOverload) {
              return json(
                {
                  error:
                    'AI service is temporarily unavailable due to high demand. Please try again in a moment.',
                },
                { status: 503 },
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
