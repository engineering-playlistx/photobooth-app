import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('AIGenerationService constructor', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('replicate', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('when AI_PROVIDER is google', () => {
    it('initializes successfully without REPLICATE_API_KEY', async () => {
      vi.stubEnv('AI_PROVIDER', 'google')
      vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', 'test-google-key')
      vi.stubEnv('REPLICATE_API_KEY', '')

      const { AIGenerationService } = await import('./ai-generation.service')
      expect(() => new AIGenerationService()).not.toThrow()
    })

    it('throws if GOOGLE_AI_STUDIO_API_KEY is not set', async () => {
      vi.stubEnv('AI_PROVIDER', 'google')
      vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', '')

      const { AIGenerationService } = await import('./ai-generation.service')
      expect(() => new AIGenerationService()).toThrow(
        'GOOGLE_AI_STUDIO_API_KEY environment variable is required',
      )
    })
  })

  describe('when AI_PROVIDER is replicate (default)', () => {
    it('initializes successfully without GOOGLE_AI_STUDIO_API_KEY', async () => {
      vi.stubEnv('AI_PROVIDER', 'replicate')
      vi.stubEnv('REPLICATE_API_KEY', 'test-replicate-key')
      vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', '')

      const { AIGenerationService } = await import('./ai-generation.service')
      expect(() => new AIGenerationService()).not.toThrow()
    })

    it('throws if REPLICATE_API_KEY is not set', async () => {
      vi.stubEnv('AI_PROVIDER', 'replicate')
      vi.stubEnv('REPLICATE_API_KEY', '')

      const { AIGenerationService } = await import('./ai-generation.service')
      expect(() => new AIGenerationService()).toThrow(
        'REPLICATE_API_KEY environment variable is required',
      )
    })
  })
})
