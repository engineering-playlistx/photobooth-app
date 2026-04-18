import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_AUTH = 'Bearer test-secret'

function makeCtx(body: unknown, authHeader: string = VALID_AUTH) {
  return {
    request: new Request('http://localhost/api/ai-generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    }),
  }
}

// Minimal event config with one Replicate-backed theme
function makeEventConfigData(
  provider: 'replicate' | 'google' = 'replicate',
  providerFallback?: 'replicate' | 'google',
) {
  return {
    config_json: {
      moduleFlow: [
        {
          moduleId: 'ai-generation',
          provider,
          ...(providerFallback ? { providerFallback } : {}),
          themes: [
            {
              id: 'pitcrew',
              templateImageUrl: 'https://cdn.example.com/template.png',
              prompt: 'A racing pit crew member',
            },
          ],
        },
      ],
    },
  }
}

describe('POST /api/ai-generate', () => {
  let handler: (ctx: any) => Promise<{ body: unknown; status: number }>
  let mockCreatePrediction: ReturnType<typeof vi.fn>
  let mockGenerateGoogleAISync: ReturnType<typeof vi.fn>
  let mockSingle: ReturnType<typeof vi.fn>
  let mockAiJobsInsert: ReturnType<typeof vi.fn>
  let mockAiJobsUpdateEq: ReturnType<typeof vi.fn>
  let mockStorageUpload: ReturnType<typeof vi.fn>
  let mockStorageGetPublicUrl: ReturnType<typeof vi.fn>
  let mockStorageRemove: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('API_CLIENT_KEY', 'test-secret')

    // ── AIGenerationService mock ──────────────────────────────────────────
    mockCreatePrediction = vi.fn().mockResolvedValue('pred-replicate-123')
    mockGenerateGoogleAISync = vi
      .fn()
      .mockResolvedValue('data:image/png;base64,generatedpixels')

    // ── Supabase DB mock ──────────────────────────────────────────────────
    mockSingle = vi.fn().mockResolvedValue({
      data: makeEventConfigData(),
      error: null,
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

    mockAiJobsUpdateEq = vi.fn().mockResolvedValue({ error: null })
    const mockAiJobsUpdate = vi.fn().mockReturnValue({ eq: mockAiJobsUpdateEq })
    mockAiJobsInsert = vi.fn().mockResolvedValue({ error: null })

    const mockSupabaseFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'event_configs') return { select: mockSelect }
      if (table === 'ai_jobs')
        return { insert: mockAiJobsInsert, update: mockAiJobsUpdate }
      return {}
    })

    // ── Supabase Storage mock ─────────────────────────────────────────────
    mockStorageUpload = vi.fn().mockResolvedValue({ error: null })
    mockStorageGetPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: 'https://storage.example.com/temp/photo.png' },
    })
    mockStorageRemove = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockStorageFrom = vi.fn().mockReturnValue({
      upload: mockStorageUpload,
      getPublicUrl: mockStorageGetPublicUrl,
      remove: mockStorageRemove,
    })

    vi.doMock('@tanstack/react-router', () => ({
      createFileRoute: () => (options: any) => {
        handler = options.server.handlers.POST
        return { options }
      },
    }))

    vi.doMock('@tanstack/react-start', () => ({
      json: (data: unknown, init?: { status?: number }) => ({
        body: data,
        status: init?.status ?? 200,
      }),
    }))

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({
        from: mockSupabaseFrom,
        storage: { from: mockStorageFrom },
      }),
    }))

    vi.doMock('../services/ai-generation.service', () => ({
      AIGenerationService: vi.fn().mockImplementation(() => ({
        createPrediction: mockCreatePrediction,
        generateGoogleAISync: mockGenerateGoogleAISync,
      })),
    }))

    await import('./api.ai-generate')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('AG-03: returns 401 when Authorization header is missing', async () => {
    const ctx = {
      request: new Request('http://localhost/api/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPhotoBase64: 'b64',
          theme: 'pitcrew',
          eventId: 'evt-1',
        }),
      }),
    }
    const res = await handler(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await handler(
      makeCtx(
        { userPhotoBase64: 'b64', theme: 'pitcrew', eventId: 'evt-1' },
        'Bearer wrong-key',
      ),
    )
    expect(res.status).toBe(401)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('AG-04: returns 400 when userPhotoBase64 is missing', async () => {
    const res = await handler(makeCtx({ theme: 'pitcrew', eventId: 'evt-1' }))
    expect(res.status).toBe(400)
  })

  it('AG-05: returns 400 when theme is missing', async () => {
    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        eventId: 'evt-1',
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when eventId is missing', async () => {
    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
      }),
    )
    expect(res.status).toBe(400)
  })

  // ── Success: Replicate ────────────────────────────────────────────────────

  it('AG-01: Replicate provider → 200 + { predictionId, provider: "replicate" }', async () => {
    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )
    expect(res.status).toBe(200)
    expect((res.body as any).predictionId).toBe('pred-replicate-123')
    expect((res.body as any).provider).toBe('replicate')
    expect(mockCreatePrediction).toHaveBeenCalledOnce()
  })

  // ── Success: Google ───────────────────────────────────────────────────────

  it('AG-02: Google provider → 200 + { predictionId (UUID), provider: "google" }', async () => {
    mockSingle.mockResolvedValueOnce({
      data: makeEventConfigData('google'),
      error: null,
    })

    const fakeBytes = new Uint8Array([1, 2, 3])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(fakeBytes.buffer),
        headers: { get: vi.fn().mockReturnValue('image/jpeg') },
      }),
    )

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).provider).toBe('google')
    expect((res.body as any).predictionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
    expect(mockGenerateGoogleAISync).toHaveBeenCalledOnce()
    // Google path stores result in ai_jobs — should insert then update
    expect(mockAiJobsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
    )
    expect(mockAiJobsUpdateEq).toHaveBeenCalled()
  })

  // ── Fallback chain ────────────────────────────────────────────────────────

  it('AG-06: primary Replicate fails → fallback Google used → 200', async () => {
    mockSingle.mockResolvedValueOnce({
      data: makeEventConfigData('replicate', 'google'),
      error: null,
    })

    // Primary (replicate) createPrediction fails
    mockCreatePrediction.mockRejectedValueOnce(
      new Error('Replicate unavailable'),
    )

    // Fallback (google): stub fetch for template pre-fetch
    const fakeBytes = new Uint8Array([1, 2, 3])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(fakeBytes.buffer),
        headers: { get: vi.fn().mockReturnValue('image/jpeg') },
      }),
    )

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).provider).toBe('google')
    expect(mockGenerateGoogleAISync).toHaveBeenCalledOnce()
  })

  it('AG-07: both providers fail → 500', async () => {
    mockSingle.mockResolvedValueOnce({
      data: makeEventConfigData('replicate', 'google'),
      error: null,
    })

    // Primary (replicate) fails
    mockCreatePrediction.mockRejectedValueOnce(
      new Error('Replicate unavailable'),
    )

    // Fallback (google) fails because fetch rejects
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    )

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(500)
  })

  it('AG-08: non-Error thrown → 500 with generic message', async () => {
    // Make the storage upload throw a non-Error to keep it simple
    mockStorageUpload.mockRejectedValueOnce('a string, not an Error object')

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).error).toBe('Internal server error')
  })

  // ── Theme/config resolution errors ────────────────────────────────────────

  it('returns 503 when event config not found in Supabase', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not found' },
    })

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'unknown-evt',
      }),
    )

    expect(res.status).toBe(503)
  })

  it('returns 400 when theme is not found in event config', async () => {
    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'unknown-theme',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(400)
  })

  // ── 503 overload detection ────────────────────────────────────────────────

  it('returns 503 when error message indicates provider overload', async () => {
    mockCreatePrediction.mockRejectedValueOnce(
      new Error('Service temporarily unavailable: 503 overloaded'),
    )

    const res = await handler(
      makeCtx({
        userPhotoBase64: 'data:image/png;base64,abc',
        theme: 'pitcrew',
        eventId: 'evt-1',
      }),
    )

    expect(res.status).toBe(503)
  })
})
