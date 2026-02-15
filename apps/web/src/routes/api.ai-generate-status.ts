import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { AIGenerationService } from '../services/ai-generation.service'
import { getSupabaseAdminClient } from '../utils/supabase-admin'

const SUPABASE_BUCKET = 'photobooth-bucket'

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

          if (!predictionId || !tempPath) {
            return json(
              {
                error:
                  'Missing required query params: predictionId and tempPath',
              },
              { status: 400 },
            )
          }

          const aiService = new AIGenerationService()
          const { status, output } =
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
            const supabase = getSupabaseAdminClient()
            await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])
            return json(
              { status, error: `AI generation ${status}` },
              { status: 500 },
            )
          }

          // Succeeded — download result and clean up
          if (status === 'succeeded') {
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
            const generatedImageBase64 =
              await aiService.downloadAsBase64(resultUrl)

            console.log(`[ai-generate-status] Cleaning up temp photo`)
            const supabase = getSupabaseAdminClient()
            await supabase.storage.from(SUPABASE_BUCKET).remove([tempPath])

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
