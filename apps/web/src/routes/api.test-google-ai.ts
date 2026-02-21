import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Simple synchronous test endpoint — no template fetch, no auth required.
// Used to verify Google AI Studio connectivity and API key validity.
const TEST_PROMPT =
  'Generate a simple image of a red racing car on a race track. The car should be front-facing, on a sunny day.'

export const Route = createFileRoute('/api/test-google-ai')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
          if (!apiKey) {
            return json(
              { success: false, error: 'GOOGLE_AI_STUDIO_API_KEY not set' },
              { status: 500 },
            )
          }

          const model = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash-image'
          console.log(`[test-google-ai] Starting test — model: ${model}`)
          const startTime = Date.now()

          const googleAI = new GoogleGenerativeAI(apiKey)
          const generativeModel = googleAI.getGenerativeModel({ model })

          const result = await generativeModel.generateContent({
            contents: [
              {
                role: 'user',
                parts: [{ text: TEST_PROMPT }],
              },
            ],

            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
          })

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
          console.log(`[test-google-ai] Response received in ${elapsed}s`)

          const parts = result.response.candidates?.[0]?.content?.parts ?? []

          const imagePart = parts.find((p: any) => p.inlineData?.data)

          if (!(imagePart as any)?.inlineData) {
            const rawText = parts

              .map((p: any) => p.text)
              .filter(Boolean)
              .join(' ')
            console.error(
              `[test-google-ai] No image in response. Text: ${rawText}`,
            )
            return json(
              {
                success: false,
                error: `No image returned. Model said: ${rawText || '(empty)'}`,
                elapsedSeconds: elapsed,
              },
              { status: 500 },
            )
          }

          const { mimeType, data } = (imagePart as any).inlineData
          const imageBase64 = `data:${mimeType};base64,${data}`
          const sizeKB = Math.round(imageBase64.length / 1024)

          console.log(
            `[test-google-ai] Success — image size: ${sizeKB}KB, elapsed: ${elapsed}s`,
          )

          return json({
            success: true,
            imageBase64,
            model,
            elapsedSeconds: elapsed,
          })
        } catch (error) {
          console.error('[test-google-ai] Error:', error)
          return json(
            {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
