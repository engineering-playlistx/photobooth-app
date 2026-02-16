import Replicate from 'replicate'

export type RacingTheme = 'pitcrew' | 'motogp' | 'f1'

export interface GenerateFaceSwapParams {
  userPhotoUrl: string
  theme: RacingTheme
}

const TEMPLATE_URLS: Record<RacingTheme, string | undefined> = {
  pitcrew: process.env.RACING_TEMPLATE_PITCREW_URL,
  motogp: process.env.RACING_TEMPLATE_MOTOGP_URL,
  f1: process.env.RACING_TEMPLATE_F1_URL,
}

const DEFAULT_MODEL = 'google/nano-banana-pro'
const REPLICATE_MODEL = process.env.REPLICATE_MODEL || DEFAULT_MODEL

const THEME_PROMPTS: Record<RacingTheme, string | undefined> = {
  pitcrew: process.env.RACING_PROMPT_PITCREW,
  motogp: process.env.RACING_PROMPT_MOTOGP,
  f1: process.env.RACING_PROMPT_F1,
}

export class AIGenerationService {
  private replicate: Replicate

  constructor() {
    const apiKey = process.env.REPLICATE_API_KEY
    if (!apiKey) {
      throw new Error('REPLICATE_API_KEY environment variable is required')
    }
    this.replicate = new Replicate({ auth: apiKey })
  }

  async createPrediction(params: GenerateFaceSwapParams): Promise<string> {
    const targetImageUrl = TEMPLATE_URLS[params.theme]
    if (!targetImageUrl) {
      throw new Error(
        `Template image URL not configured for theme: ${params.theme}`,
      )
    }

    const prompt = THEME_PROMPTS[params.theme]
    if (!prompt) {
      throw new Error(`Prompt not configured for theme: ${params.theme}`)
    }

    console.log(`[AIService] Creating prediction — model: ${REPLICATE_MODEL}`)
    console.log(`[AIService] Theme: ${params.theme}`)
    console.log(`[AIService] User photo URL: ${params.userPhotoUrl}`)
    console.log(`[AIService] Template URL: ${targetImageUrl}`)

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
      `[AIService] Prediction created — id: ${prediction.id}, status: ${prediction.status}`,
    )
    return prediction.id
  }

  async getPredictionStatus(predictionId: string): Promise<{
    status: string
    output: unknown
  }> {
    const prediction = await this.replicate.predictions.get(predictionId)
    return { status: prediction.status, output: prediction.output }
  }

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
