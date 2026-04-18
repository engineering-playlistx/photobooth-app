import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared helper: builds a minimal Replicate mock client
// ---------------------------------------------------------------------------
function makeReplicateMock(
  predictionId = 'pred-123',
  predictionStatus: Record<string, unknown> = {
    status: 'succeeded',
    output: 'https://example.com/result.png',
  },
) {
  return {
    default: vi.fn().mockImplementation(() => ({
      predictions: {
        create: vi
          .fn()
          .mockResolvedValue({ id: predictionId, status: 'starting' }),
        get: vi.fn().mockResolvedValue(predictionStatus),
      },
    })),
  }
}

// Shared helper: builds a minimal Google AI mock
function makeGoogleAIMock(
  imageMimeType = 'image/png',
  imageData = 'generatedbase64data',
) {
  const mockGenerateContent = vi.fn().mockResolvedValue({
    response: {
      candidates: [
        {
          content: {
            parts: [
              { inlineData: { mimeType: imageMimeType, data: imageData } },
            ],
          },
        },
      ],
    },
  })
  const mockGetModel = vi
    .fn()
    .mockReturnValue({ generateContent: mockGenerateContent })
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetModel,
    })),
    _mockGenerateContent: mockGenerateContent,
    _mockGetModel: mockGetModel,
  }
}

// Shared helper: builds a minimal Supabase admin mock
function makeSupabaseMock() {
  const mockUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockUpdateEq })
  const mockInsert = vi.fn().mockResolvedValue({ error: null })
  const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({
    insert: mockInsert,
    update: mockUpdate,
    select: mockSelect,
  })
  return {
    getSupabaseAdminClient: () => ({ from: mockFrom }),
    _mockFrom: mockFrom,
    _mockInsert: mockInsert,
    _mockUpdate: mockUpdate,
    _mockUpdateEq: mockUpdateEq,
    _mockSelect: mockSelect,
    _mockEq: mockEq,
    _mockSingle: mockSingle,
  }
}

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

// ---------------------------------------------------------------------------
// createPrediction — Replicate provider (AG-SVC-01 to AG-SVC-04)
// ---------------------------------------------------------------------------

describe('AIGenerationService.createPrediction — Replicate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('REPLICATE_API_KEY', 'test-replicate-key')
    vi.stubEnv('REPLICATE_MODEL', 'owner/model')
    vi.doMock('replicate', () => makeReplicateMock('pred-xyz'))
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // AG-SVC-01
  it('calls replicate.predictions.create and returns the prediction ID', async () => {
    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    const result = await service.createPrediction({
      userPhotoUrl: 'https://example.com/photo.png',
      theme: 'pitcrew',
      templateUrl: 'https://example.com/template.png',
      prompt: 'A racing pit crew member',
    })

    expect(result).toBe('pred-xyz')
  })

  // AG-SVC-01 — correct input shape passed to Replicate
  it('passes correct input shape to replicate.predictions.create', async () => {
    const replicateMock = makeReplicateMock('pred-xyz')
    vi.doMock('replicate', () => replicateMock)

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    await service.createPrediction({
      userPhotoUrl: 'https://example.com/photo.png',
      theme: 'pitcrew',
      templateUrl: 'https://example.com/template.png',
      prompt: 'Race day action shot',
    })

    // Get the mock instance's predictions.create spy

    const replicateInstance = (replicateMock.default as any).mock.results[0]
      .value
    expect(replicateInstance.predictions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: 'Race day action shot',
          image_input: [
            'https://example.com/photo.png',
            'https://example.com/template.png',
          ],
        }),
      }),
    )
  })

  // AG-SVC-03
  it('throws when templateUrl is missing', async () => {
    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    await expect(
      service.createPrediction({
        userPhotoUrl: 'https://example.com/photo.png',
        theme: 'pitcrew',
        templateUrl: '',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow('No template URL configured')
  })

  // AG-SVC-04
  it('throws when prompt is missing', async () => {
    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    await expect(
      service.createPrediction({
        userPhotoUrl: 'https://example.com/photo.png',
        theme: 'pitcrew',
        templateUrl: 'https://example.com/template.png',
        prompt: '',
      }),
    ).rejects.toThrow('No prompt configured')
  })
})

// ---------------------------------------------------------------------------
// createPrediction — Google provider (AG-SVC-02)
// ---------------------------------------------------------------------------

describe('AIGenerationService.createPrediction — Google', () => {
  let supabaseMock: ReturnType<typeof makeSupabaseMock>

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', 'test-google-key')
    vi.stubEnv('GOOGLE_AI_MODEL', 'gemini-test')
    supabaseMock = makeSupabaseMock()
    vi.doMock('replicate', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('@google/generative-ai', () => makeGoogleAIMock())
    vi.doMock('../utils/supabase-admin', () => supabaseMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // AG-SVC-02
  it('inserts an ai_jobs row and returns a UUID job ID', async () => {
    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    const result = await service.createPrediction({
      userPhotoUrl: '',
      userPhotoBase64: 'data:image/png;base64,aGVsbG8=',
      theme: 'pitcrew',
      templateUrl: 'https://example.com/template.png',
      prompt: 'test prompt',
    })

    // Returns a UUID
    expect(result).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    // Initial ai_jobs insert with status=processing
    expect(supabaseMock._mockFrom).toHaveBeenCalledWith('ai_jobs')
    expect(supabaseMock._mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
    )
  })

  it('throws when the initial ai_jobs insert fails', async () => {
    supabaseMock._mockInsert.mockResolvedValueOnce({
      error: { message: 'insert failed' },
    })

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    await expect(
      service.createPrediction({
        userPhotoUrl: '',
        userPhotoBase64: 'data:image/png;base64,aGVsbG8=',
        theme: 'pitcrew',
        templateUrl: 'https://example.com/template.png',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow('Failed to create ai_job row: insert failed')
  })
})

// ---------------------------------------------------------------------------
// generateGoogleAISync (AG-SVC — sync generation path)
// ---------------------------------------------------------------------------

describe('AIGenerationService.generateGoogleAISync', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', 'test-google-key')
    vi.stubEnv('GOOGLE_AI_MODEL', 'gemini-test')
    vi.doMock('replicate', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns a base64 data URI on success (using pre-fetched template)', async () => {
    const googleMock = makeGoogleAIMock('image/png', 'generatedpixels')
    vi.doMock('@google/generative-ai', () => googleMock)

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    const result = await service.generateGoogleAISync({
      userPhotoUrl: '',
      userPhotoBase64: 'data:image/png;base64,aGVsbG8=',
      templateBase64: 'dGVtcGxhdGU=',
      templateMimeType: 'image/jpeg',
      theme: 'pitcrew',
      templateUrl: 'https://example.com/template.png',
      prompt: 'Race day action shot',
    })

    expect(result).toBe('data:image/png;base64,generatedpixels')
  })

  it('throws when Google AI returns no image part in response', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: 'I cannot generate this image.' }],
            },
          },
        ],
      },
    })
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi
          .fn()
          .mockReturnValue({ generateContent: mockGenerateContent }),
      })),
    }))

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    await expect(
      service.generateGoogleAISync({
        userPhotoUrl: '',
        userPhotoBase64: 'data:image/png;base64,aGVsbG8=',
        templateBase64: 'dGVtcGxhdGU=',
        templateMimeType: 'image/jpeg',
        theme: 'pitcrew',
        templateUrl: 'https://example.com/template.png',
        prompt: 'test',
      }),
    ).rejects.toThrow('No image output returned from Google AI model')
  })

  it('throws when templateUrl is missing', async () => {
    vi.doMock('@google/generative-ai', () => makeGoogleAIMock())

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    await expect(
      service.generateGoogleAISync({
        userPhotoUrl: '',
        theme: 'pitcrew',
        templateUrl: '',
        prompt: 'test',
      }),
    ).rejects.toThrow('No template URL configured')
  })

  it('throws when prompt is missing', async () => {
    vi.doMock('@google/generative-ai', () => makeGoogleAIMock())

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    await expect(
      service.generateGoogleAISync({
        userPhotoUrl: '',
        theme: 'pitcrew',
        templateUrl: 'https://example.com/template.png',
        prompt: '',
      }),
    ).rejects.toThrow('No prompt configured')
  })
})

// ---------------------------------------------------------------------------
// getPredictionStatus — Replicate (AG-SVC-05 to AG-SVC-07)
// ---------------------------------------------------------------------------

describe('AIGenerationService.getPredictionStatus — Replicate', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('REPLICATE_API_KEY', 'test-replicate-key')
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // AG-SVC-05
  it('returns processing status when prediction is still running', async () => {
    vi.doMock('replicate', () =>
      makeReplicateMock('pred-123', { status: 'processing', output: null }),
    )

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    const result = await service.getPredictionStatus('pred-123')
    expect(result.status).toBe('processing')
    expect(result.output).toBeNull()
  })

  // AG-SVC-06
  it('returns succeeded status with output URL when done', async () => {
    vi.doMock('replicate', () =>
      makeReplicateMock('pred-123', {
        status: 'succeeded',
        output: 'https://example.com/result.png',
      }),
    )

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    const result = await service.getPredictionStatus('pred-123')
    expect(result.status).toBe('succeeded')
    expect(result.output).toBe('https://example.com/result.png')
  })

  // AG-SVC-07
  it('returns failed status when prediction failed', async () => {
    vi.doMock('replicate', () =>
      makeReplicateMock('pred-123', { status: 'failed', output: null }),
    )

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    const result = await service.getPredictionStatus('pred-123')
    expect(result.status).toBe('failed')
  })
})

// ---------------------------------------------------------------------------
// getPredictionStatus — Google provider (AG-SVC-08 to AG-SVC-09)
// ---------------------------------------------------------------------------

describe('AIGenerationService.getPredictionStatus — Google', () => {
  let supabaseMock: ReturnType<typeof makeSupabaseMock>

  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('GOOGLE_AI_STUDIO_API_KEY', 'test-google-key')
    vi.doMock('replicate', () => ({
      default: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
    supabaseMock = makeSupabaseMock()
    vi.doMock('../utils/supabase-admin', () => supabaseMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // AG-SVC-09
  it('returns processing status when ai_jobs row is still processing', async () => {
    supabaseMock._mockSingle.mockResolvedValueOnce({
      data: { status: 'processing', output: null, error: null },
      error: null,
    })

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    const result = await service.getPredictionStatus('job-123')
    expect(result.status).toBe('processing')
    expect(result.generatedBase64).toBeUndefined()
  })

  // AG-SVC-08
  it('returns succeeded status with generatedBase64 when job is done', async () => {
    supabaseMock._mockSingle.mockResolvedValueOnce({
      data: {
        status: 'succeeded',
        output: 'data:image/png;base64,abc',
        error: null,
      },
      error: null,
    })

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    const result = await service.getPredictionStatus('job-123')
    expect(result.status).toBe('succeeded')
    expect(result.generatedBase64).toBe('data:image/png;base64,abc')
  })

  it('returns failed status when Supabase query errors', async () => {
    supabaseMock._mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'db error' },
    })

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    const result = await service.getPredictionStatus('job-123')
    expect(result.status).toBe('failed')
    expect(result.output).toBeNull()
  })

  it('queries the ai_jobs table with the correct predictionId', async () => {
    supabaseMock._mockSingle.mockResolvedValueOnce({
      data: { status: 'processing', output: null },
      error: null,
    })

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('google')

    await service.getPredictionStatus('job-abc')
    expect(supabaseMock._mockFrom).toHaveBeenCalledWith('ai_jobs')
    expect(supabaseMock._mockEq).toHaveBeenCalledWith('id', 'job-abc')
  })
})

// ---------------------------------------------------------------------------
// extractUrl (AG-SVC-12 to AG-SVC-13)
// ---------------------------------------------------------------------------

describe('AIGenerationService.extractUrl', () => {
  let service: any

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('REPLICATE_API_KEY', 'test-replicate-key')
    vi.doMock('replicate', () => makeReplicateMock())
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    const { AIGenerationService } = await import('./ai-generation.service')
    service = new AIGenerationService('replicate')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // AG-SVC-13
  it('returns string output directly', () => {
    expect(service.extractUrl('https://example.com/result.png')).toBe(
      'https://example.com/result.png',
    )
  })

  // AG-SVC-12
  it('returns the first element of a string array', () => {
    expect(
      service.extractUrl([
        'https://example.com/first.png',
        'https://example.com/second.png',
      ]),
    ).toBe('https://example.com/first.png')
  })

  it('extracts URL from a FileOutput object in an array (url() method)', () => {
    const fileOutput = { url: () => 'https://example.com/file-output.png' }
    expect(service.extractUrl([fileOutput])).toBe(
      'https://example.com/file-output.png',
    )
  })

  it('extracts URL from a top-level FileOutput object', () => {
    const fileOutput = { url: () => 'https://example.com/top-level.png' }
    expect(service.extractUrl(fileOutput)).toBe(
      'https://example.com/top-level.png',
    )
  })

  it('returns null for null input', () => {
    expect(service.extractUrl(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(service.extractUrl(undefined)).toBeNull()
  })

  it('returns null for an array with a null first element', () => {
    expect(service.extractUrl([null])).toBeNull()
  })

  it('falls back to String() conversion for http-starting stringifiable values', () => {
    // An object whose toString starts with http
    const obj = { toString: () => 'https://fallback.example.com/img.png' }
    expect(service.extractUrl(obj)).toBe('https://fallback.example.com/img.png')
  })
})

// ---------------------------------------------------------------------------
// downloadAsBase64 (AG-SVC-10 to AG-SVC-11)
// ---------------------------------------------------------------------------

describe('AIGenerationService.downloadAsBase64', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('REPLICATE_API_KEY', 'test-replicate-key')
    vi.doMock('replicate', () => makeReplicateMock())
    vi.doMock('@google/generative-ai', () => ({
      GoogleGenerativeAI: vi.fn().mockImplementation(() => ({})),
    }))
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // AG-SVC-10
  it('fetches the URL and returns a base64 data URI', async () => {
    const fakeBytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBytes.buffer),
      headers: { get: vi.fn().mockReturnValue('image/png') },
    })
    vi.stubGlobal('fetch', mockFetch)

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    const result = await service.downloadAsBase64(
      'https://example.com/result.png',
    )

    expect(mockFetch).toHaveBeenCalledWith('https://example.com/result.png')
    expect(result).toMatch(/^data:image\/png;base64,/)
    // "Hello" in base64 is "SGVsbG8="
    expect(result).toBe('data:image/png;base64,SGVsbG8=')
  })

  // AG-SVC-11
  it('throws when the fetch response is not ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      }),
    )

    const { AIGenerationService } = await import('./ai-generation.service')
    const service = new AIGenerationService('replicate')

    await expect(
      service.downloadAsBase64('https://example.com/missing.png'),
    ).rejects.toThrow('Failed to download generated image: Not Found')
  })
})
