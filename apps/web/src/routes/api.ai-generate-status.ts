import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { AIGenerationService } from '../services/ai-generation.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../utils/constants'

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

export const Route = createFileRoute('/api/ai-generate-status')({
  server: {
    handlers: {
      GET: async (ctx) => {
        try {
          const request = ctx.request

          if (!validateApiKey(request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const url = new URL(request.url)
          const predictionId = url.searchParams.get('predictionId')
          const tempPath = url.searchParams.get('tempPath')

          if (!predictionId) {
            return json(
              {
                error: 'Missing required query param: predictionId',
              },
              { status: 400 },
            )
          }

          const aiService = new AIGenerationService()
          const { status, output, generatedBase64 } =
            await aiService.getPredictionStatus(predictionId)

          console.log(
            `[ai-generate-status] Prediction ${predictionId} — status: ${status}`,
          )

          // Still processing
          if (status === 'starting' || status === 'processing') {
            return json({ status })
          }

          // Failed or canceled
          if (status === 'failed' || status === 'canceled') {
            console.error(`[ai-generate-status] Prediction ${status}:`, output)
            if (tempPath) {
              const supabase = getSupabaseAdminClient()
              await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])
            }
            return json(
              { status, error: `AI generation ${status}` },
              { status: 500 },
            )
          }

          // Succeeded
          if (status === 'succeeded') {
            let generatedImageBase64: string

            if (generatedBase64) {
              // Google AI: output is already a base64 data URI — no download needed
              console.log(
                `[ai-generate-status] Google AI job succeeded — using inline base64 output`,
              )
              generatedImageBase64 = generatedBase64
            } else {
              // Replicate: extract URL and download the image
              const resultUrl = aiService.extractUrl(output)
              if (!resultUrl) {
                console.error(
                  '[ai-generate-status] No output URL from prediction:',
                  output,
                )
                return json(
                  { status: 'failed', error: 'No output URL from AI model' },
                  { status: 500 },
                )
              }
              console.log(`[ai-generate-status] Downloading generated image...`)
              generatedImageBase64 = await aiService.downloadAsBase64(resultUrl)
            }

            if (tempPath) {
              console.log(`[ai-generate-status] Cleaning up temp photo`)
              const supabase = getSupabaseAdminClient()
              await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])
            }

            console.log(
              `[ai-generate-status] Done — response size: ${Math.round(generatedImageBase64.length / 1024)}KB`,
            )

            return json({ status: 'succeeded', generatedImageBase64 })
          }

          // Unknown status
          return json({ status })
        } catch (error) {
          console.error({ message: 'AI generation status error', error })
          if (error instanceof Error) {
            return json({ error: error.message }, { status: 500 })
          }
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
