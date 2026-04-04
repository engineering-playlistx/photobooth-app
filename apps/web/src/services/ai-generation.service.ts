import Replicate from 'replicate'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getSupabaseAdminClient } from '../utils/supabase-admin'

export interface GenerateFaceSwapParams {
  userPhotoUrl: string
  userPhotoBase64?: string // used by Google AI provider (skips Supabase upload)
  templateBase64?: string // pre-fetched by route handler (skips background fetch)
  templateMimeType?: string
  theme: string
  templateUrl?: string // comes from EventConfig; required at runtime
  prompt?: string // comes from EventConfig; required at runtime
}

const DEFAULT_MODEL = 'google/nano-banana-pro'
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || DEFAULT_MODEL
const GOOGLE_AI_MODEL = process.env.GOOGLE_AI_MODEL || 'gemini-2.5-flash-image'
export const AI_PROVIDER = process.env.AI_PROVIDER || 'replicate' // 'replicate' | 'google'

// ---------------------------------------------------------------------------
// Supabase-backed job store for Google AI predictions.
// Replaces the previous module-level Map which was incompatible with
// Cloudflare Workers (stateless/ephemeral — each isolate has an empty Map).
// ---------------------------------------------------------------------------

export class AIGenerationService {
  private replicate: Replicate | null = null
  private googleAI: GoogleGenerativeAI | null = null
  private readonly provider: 'replicate' | 'google'

  constructor(providerOverride?: 'replicate' | 'google') {
    this.provider = providerOverride ?? (AI_PROVIDER as 'replicate' | 'google')

    if (this.provider === 'google') {
      const googleApiKey = process.env.GOOGLE_AI_STUDIO_API_KEY
      if (!googleApiKey) {
        throw new Error(
          'GOOGLE_AI_STUDIO_API_KEY environment variable is required',
        )
      }
      this.googleAI = new GoogleGenerativeAI(googleApiKey)
    } else {
      const replicateApiKey = process.env.REPLICATE_API_KEY
      if (!replicateApiKey) {
        throw new Error('REPLICATE_API_KEY environment variable is required')
      }
      this.replicate = new Replicate({ auth: replicateApiKey })
    }
  }

  async createPrediction(params: GenerateFaceSwapParams): Promise<string> {
    if (this.provider === 'google') {
      return this.createGooglePrediction(params)
    }
    return this.createReplicatePrediction(params)
  }

  // ---------------------------------------------------------------------------
  // Replicate provider (existing logic, unchanged)
  // ---------------------------------------------------------------------------

  private async createReplicatePrediction(
    params: GenerateFaceSwapParams,
  ): Promise<string> {
    const targetImageUrl = params.templateUrl
    if (!targetImageUrl) {
      throw new Error(
        `No template URL configured for theme: ${params.theme} — set templateImageUrl in event config`,
      )
    }

    const prompt = params.prompt
    if (!prompt) {
      throw new Error(
        `No prompt configured for theme: ${params.theme} — set prompt in event config`,
      )
    }

    console.log(
      `[AIService] Creating Replicate prediction — model: ${REPLICATE_MODEL}`,
    )
    console.log(`[AIService] Theme: ${params.theme}`)
    console.log(`[AIService] User photo URL: ${params.userPhotoUrl}`)
    console.log(`[AIService] Template URL: ${targetImageUrl}`)

    if (!this.replicate) {
      throw new Error("Replicate not initialized — provider is 'google'")
    }
    const prediction = await this.replicate.predictions.create({
      model: REPLICATE_MODEL as `${string}/${string}`,
      input: {
        prompt,
        image_input: [params.userPhotoUrl, targetImageUrl],
        resolution: '2K',
        output_format: 'png',
        safety_filter_level: 'block_only_high',
      },
    })

    console.log(
      `[AIService] Replicate prediction created — id: ${prediction.id}, status: ${prediction.status}`,
    )
    return prediction.id
  }

  // ---------------------------------------------------------------------------
  // Google AI provider
  // ---------------------------------------------------------------------------

  private async createGooglePrediction(
    params: GenerateFaceSwapParams,
  ): Promise<string> {
    const jobId = crypto.randomUUID()
    const admin = getSupabaseAdminClient()

    console.log(`[AIService] Creating Google AI job — id: ${jobId}`)
    console.log(`[AIService] Theme: ${params.theme}`)

    // Insert initial row so status polling can find it immediately
    const { error: insertError } = await admin
      .from('ai_jobs')
      .insert({ id: jobId, status: 'processing' })
    if (insertError) {
      throw new Error(`Failed to create ai_job row: ${insertError.message}`)
    }

    // Fire and forget — don't await, so the route returns immediately
    this._generateGoogleBase64(jobId, params)
      .then(async (outputBase64) => {
        console.log(`[AIService] Google AI job ${jobId} succeeded`)
        await admin
          .from('ai_jobs')
          .update({
            status: 'succeeded',
            output: outputBase64,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      })
      .catch(async (err) => {
        console.error(`[AIService] Google AI job ${jobId} failed:`, err)
        await admin
          .from('ai_jobs')
          .update({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId)
      })

    return jobId
  }

  // ---------------------------------------------------------------------------
  // Public sync entry point — call from route handler so the await runs inside
  // an active HTTP request context (fire-and-forget background tasks hang in
  // Nitro/Vite dev and some production runtimes).
  // ---------------------------------------------------------------------------

  async generateGoogleAISync(params: GenerateFaceSwapParams): Promise<string> {
    const jobId = 'sync-' + crypto.randomUUID()
    console.log(`[AIService] Running Google AI synchronously — id: ${jobId}`)
    return this._generateGoogleBase64(jobId, params)
  }

  // Core Google AI generation — returns the base64 data URI of the result.
  private async _generateGoogleBase64(
    jobId: string,
    params: GenerateFaceSwapParams,
  ): Promise<string> {
    const targetImageUrl = params.templateUrl
    if (!targetImageUrl) {
      throw new Error(
        `No template URL configured for theme: ${params.theme} — set templateImageUrl in event config`,
      )
    }

    const prompt = params.prompt
    if (!prompt) {
      throw new Error(
        `No prompt configured for theme: ${params.theme} — set prompt in event config`,
      )
    }

    // Parse user photo base64
    console.log(`[AIService][${jobId}] Step 1 — parsing user photo`)
    const rawUserPhoto = params.userPhotoBase64 || ''
    const userPhotoMatch = rawUserPhoto.match(
      /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+);base64,(.+)$/,
    )
    const userPhotoMimeType = userPhotoMatch ? userPhotoMatch[1] : 'image/png'
    const userPhotoBase64 = userPhotoMatch ? userPhotoMatch[2] : rawUserPhoto
    console.log(
      `[AIService][${jobId}] Step 1 done — mimeType: ${userPhotoMimeType}, base64 length: ${userPhotoBase64.length}`,
    )

    // Use pre-fetched template if provided by the route handler; otherwise fetch it.
    let templateBase64: string
    let templateMimeType: string

    if (params.templateBase64) {
      console.log(`[AIService][${jobId}] Step 2 — using pre-fetched template`)
      templateBase64 = params.templateBase64
      templateMimeType = params.templateMimeType || 'image/jpeg'
      console.log(
        `[AIService][${jobId}] Step 2 done — mimeType: ${templateMimeType}`,
      )
    } else {
      console.log(
        `[AIService][${jobId}] Step 2 — fetching template: ${targetImageUrl}`,
      )
      const templateAbortController = new AbortController()
      const templateFetchTimeout = setTimeout(
        () => templateAbortController.abort(),
        15_000,
      )
      let templateResponse: Response
      try {
        templateResponse = await fetch(targetImageUrl, {
          signal: templateAbortController.signal,
        })
      } catch (fetchErr) {
        clearTimeout(templateFetchTimeout)
        throw new Error(
          `Template fetch failed: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
        )
      }
      clearTimeout(templateFetchTimeout)

      if (!templateResponse.ok) {
        throw new Error(
          `Failed to fetch template image: ${templateResponse.status} ${templateResponse.statusText}`,
        )
      }
      const templateArrayBuffer = await templateResponse.arrayBuffer()
      templateBase64 = Buffer.from(templateArrayBuffer).toString('base64')
      templateMimeType =
        templateResponse.headers.get('content-type') || 'image/jpeg'
      console.log(
        `[AIService][${jobId}] Step 2 done — template ${Math.round(templateArrayBuffer.byteLength / 1024)}KB, mimeType: ${templateMimeType}`,
      )
    }

    // Call Google AI
    console.log(
      `[AIService][${jobId}] Step 3 — calling Google AI model: ${GOOGLE_AI_MODEL}`,
    )
    const model = this.googleAI!.getGenerativeModel({ model: GOOGLE_AI_MODEL })

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: userPhotoMimeType,
                data: userPhotoBase64,
              },
            },
            {
              inlineData: { mimeType: templateMimeType, data: templateBase64 },
            },
          ],
        },
      ],

      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } as any,
    })

    console.log(`[AIService][${jobId}] Step 3 done — response received`)

    // Extract the generated image from the response
    const parts = result.response.candidates?.[0]?.content?.parts ?? []

    const imagePart = parts.find((p: any) => p.inlineData?.data)

    if (!(imagePart as any)?.inlineData) {
      const rawText = parts

        .map((p: any) => p.text)
        .filter(Boolean)
        .join(' ')
      throw new Error(
        `No image output returned from Google AI model. Response text: ${rawText || '(empty)'}`,
      )
    }

    const { mimeType, data } = (imagePart as any).inlineData
    return `data:${mimeType};base64,${data}`
  }

  // ---------------------------------------------------------------------------
  // Status polling — unified interface for both providers
  // ---------------------------------------------------------------------------

  async getPredictionStatus(predictionId: string): Promise<{
    status: string
    output: unknown
    generatedBase64?: string // set for Google AI succeeded jobs (already base64)
  }> {
    if (this.provider === 'google') {
      const admin = getSupabaseAdminClient()
      const { data, error } = await admin
        .from('ai_jobs')
        .select('status, output, error')
        .eq('id', predictionId)
        .single()
      if (error) {
        return { status: 'failed', output: null }
      }
      return {
        status: data.status as string,
        output: (data.output as string | null) ?? null,
        generatedBase64:
          data.status === 'succeeded' ? (data.output as string) : undefined,
      }
    }

    // Replicate
    if (!this.replicate) {
      throw new Error("Replicate not initialized — provider is 'google'")
    }
    const prediction = await this.replicate.predictions.get(predictionId)
    return { status: prediction.status, output: prediction.output }
  }

  // ---------------------------------------------------------------------------
  // Helpers (used by Replicate provider — kept unchanged)
  // ---------------------------------------------------------------------------

  extractUrl(output: unknown): string | null {
    // String URL (nano-banana-pro)
    if (typeof output === 'string') {
      return output
    }

    // Array of URLs or FileOutput objects (nano-banana)
    if (Array.isArray(output)) {
      const first = output[0]
      if (typeof first === 'string') return first
      if (first && typeof first === 'object' && 'url' in first) {
        return String((first as { url: () => string }).url())
      }
      if (first) return String(first)
      return null
    }

    // FileOutput object with url() method
    if (output && typeof output === 'object' && 'url' in output) {
      return String((output as { url: () => string }).url())
    }

    // Last resort: try to convert to string
    if (output) {
      const str = String(output)
      if (str.startsWith('http')) return str
    }

    return null
  }

  async downloadAsBase64(imageUrl: string): Promise<string> {
    console.log(
      `[AIService] Downloading generated image: ${imageUrl.substring(0, 100)}...`,
    )
    const startTime = Date.now()

    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(
        `Failed to download generated image: ${response.statusText}`,
      )
    }

    const arrayBuffer = await response.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ''
    for (const byte of uint8Array) {
      binary += String.fromCharCode(byte)
    }
    const base64 = btoa(binary)

    const contentType = response.headers.get('content-type') || 'image/png'
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(
      `[AIService] Downloaded ${Math.round(arrayBuffer.byteLength / 1024)}KB in ${elapsed}s`,
    )

    return `data:${contentType};base64,${base64}`
  }
}
