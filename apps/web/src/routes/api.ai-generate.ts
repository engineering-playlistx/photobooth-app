import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  AIGenerationService,
  AI_PROVIDER,
} from '../services/ai-generation.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import type { EventConfig } from '../types/event-config'
import type { AiGenerationModuleConfig } from '../types/module-config'

const SUPABASE_BUCKET = 'photobooth-bucket'

interface RequestBody {
  userPhotoBase64: string
  theme: string
  eventId?: string
}

interface ResolvedThemeConfig {
  provider: 'replicate' | 'google'
  templateUrl: string | undefined
  prompt: string | undefined
}

async function resolveThemeConfig(
  eventId: string | undefined,
  theme: string,
): Promise<ResolvedThemeConfig> {
  const envFallback: ResolvedThemeConfig = {
    provider: AI_PROVIDER as 'replicate' | 'google',
    templateUrl: undefined,
    prompt: undefined,
  }

  if (!eventId) return envFallback

  try {
    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from('event_configs')
      .select('config_json')
      .eq('event_id', eventId)
      .single()

    if (error) {
      if (error.code !== 'PGRST116') {
        console.warn(
          `[ai-generate] Event config DB error for ${eventId}:`,
          error.message,
        )
      }
      return envFallback
    }

    const config = data.config_json as EventConfig
    const aiModule = config.moduleFlow.find(
      (m): m is AiGenerationModuleConfig => m.moduleId === 'ai-generation',
    )

    if (!aiModule) {
      console.warn(
        `[ai-generate] No ai-generation module in event config for ${eventId} — using env fallback`,
      )
      return envFallback
    }

    const themeConfig = aiModule.themes.find((t) => t.id === theme)

    if (!themeConfig) {
      console.warn(
        `[ai-generate] Theme '${theme}' not in event config — using env fallback`,
      )
      return {
        provider: aiModule.provider,
        templateUrl: undefined,
        prompt: undefined,
      }
    }

    return {
      provider: aiModule.provider,
      templateUrl: themeConfig.templateImageUrl,
      prompt: themeConfig.prompt,
    }
  } catch (err) {
    console.warn(
      '[ai-generate] Failed to fetch event config — using env fallback:',
      err,
    )
    return envFallback
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

          const { provider, templateUrl, prompt } = await resolveThemeConfig(
            body.eventId,
            theme,
          )

          if (body.eventId) {
            console.log(
              `[ai-generate] Using event config — eventId: ${body.eventId}, provider: ${provider}`,
            )
          }

          const aiService = new AIGenerationService(provider)
          let predictionId: string

          if (provider === 'google') {
            // Google AI: run entirely synchronously inside the request handler.
            // Background fire-and-forget tasks hang in Nitro/Vite and some production
            // runtimes — awaiting inside the active request lifecycle is the reliable path.
            console.log(
              `[ai-generate] Using Google AI provider — synchronous mode`,
            )

            const resolvedTemplateUrl =
              templateUrl ??
              process.env[`RACING_TEMPLATE_${theme.toUpperCase()}_URL`]
            if (!resolvedTemplateUrl) {
              return json(
                { error: `Template URL not configured for theme: ${theme}` },
                { status: 500 },
              )
            }

            console.log(
              `[ai-generate] Pre-fetching template: ${resolvedTemplateUrl}`,
            )
            let templateBase64: string
            let templateMimeType: string
            try {
              const templateResponse = await fetch(resolvedTemplateUrl)
              if (!templateResponse.ok) {
                throw new Error(
                  `${templateResponse.status} ${templateResponse.statusText}`,
                )
              }
              const templateArrayBuffer = await templateResponse.arrayBuffer()
              templateBase64 =
                Buffer.from(templateArrayBuffer).toString('base64')
              templateMimeType =
                templateResponse.headers.get('content-type') || 'image/jpeg'
              console.log(
                `[ai-generate] Template pre-fetched — ${Math.round(templateArrayBuffer.byteLength / 1024)}KB, mimeType: ${templateMimeType}`,
              )
            } catch (fetchErr) {
              console.error(
                '[ai-generate] Template pre-fetch failed:',
                fetchErr,
              )
              return json(
                {
                  error: `Failed to fetch template image: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
                },
                { status: 500 },
              )
            }

            console.log(`[ai-generate] Calling Google AI synchronously...`)
            const generatedImageBase64 = await aiService.generateGoogleAISync({
              userPhotoUrl: '',
              userPhotoBase64,
              templateBase64,
              templateMimeType,
              theme,
              templateUrl: resolvedTemplateUrl,
              prompt,
            })

            const elapsed = ((Date.now() - requestStart) / 1000).toFixed(1)
            console.log(
              `[ai-generate] Google AI done in ${elapsed}s — result size: ${Math.round(generatedImageBase64.length / 1024)}KB`,
            )

            // Return the result directly — no polling needed for Google AI
            return json({ predictionId: 'google-sync', generatedImageBase64 })
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

          return json({ predictionId, tempPath })
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
            return json({ error: error.message }, { status: 500 })
          }

          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
