import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_AUTH = 'Bearer test-secret'

function makeCtx(
  params: Record<string, string>,
  authHeader: string = VALID_AUTH,
) {
  const url = new URL('http://localhost/api/ai-generate-status')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return {
    request: new Request(url.toString(), {
      method: 'GET',
      headers: { Authorization: authHeader },
    }),
  }
}

describe('GET /api/ai-generate-status', () => {
  let handler: (ctx: any) => Promise<{ body: unknown; status: number }>
  let mockGetPredictionStatus: ReturnType<typeof vi.fn>
  let mockExtractUrl: ReturnType<typeof vi.fn>
  let mockDownloadAsBase64: ReturnType<typeof vi.fn>
  let mockStorageRemove: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('API_CLIENT_KEY', 'test-secret')

    mockGetPredictionStatus = vi.fn()
    mockExtractUrl = vi
      .fn()
      .mockReturnValue('https://cdn.example.com/result.png')
    mockDownloadAsBase64 = vi
      .fn()
      .mockResolvedValue('data:image/png;base64,resultpixels')
    mockStorageRemove = vi.fn().mockResolvedValue({ data: [], error: null })

    vi.doMock('@tanstack/react-router', () => ({
      createFileRoute: () => (options: any) => {
        handler = options.server.handlers.GET
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
        storage: {
          from: vi.fn().mockReturnValue({ remove: mockStorageRemove }),
        },
      }),
    }))

    vi.doMock('../services/ai-generation.service', () => ({
      AIGenerationService: vi.fn().mockImplementation(() => ({
        getPredictionStatus: mockGetPredictionStatus,
        extractUrl: mockExtractUrl,
        downloadAsBase64: mockDownloadAsBase64,
      })),
    }))

    await import('./api.ai-generate-status')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('AS-07: returns 401 when Authorization header is missing', async () => {
    const ctx = {
      request: new Request(
        'http://localhost/api/ai-generate-status?predictionId=pred-123',
        { method: 'GET' },
      ),
    }
    const res = await handler(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await handler(
      makeCtx({ predictionId: 'pred-123' }, 'Bearer wrong-key'),
    )
    expect(res.status).toBe(401)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('AS-06: returns 400 when predictionId is missing', async () => {
    const res = await handler(makeCtx({}))
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/predictionId/)
  })

  // ── Replicate: still processing ───────────────────────────────────────────

  it('AS-01: Replicate job still running → 200 + { status: "processing" }', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'processing',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('processing')
    expect(mockDownloadAsBase64).not.toHaveBeenCalled()
  })

  it('returns 200 + { status: "starting" } for starting state', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'starting',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('starting')
  })

  // ── Replicate: succeeded ──────────────────────────────────────────────────

  it('AS-02: Replicate job succeeded → downloads image, returns generatedImageBase64', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'succeeded',
      output: 'https://cdn.example.com/result.png',
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('succeeded')
    expect((res.body as any).generatedImageBase64).toBe(
      'data:image/png;base64,resultpixels',
    )
    expect(mockExtractUrl).toHaveBeenCalledWith(
      'https://cdn.example.com/result.png',
    )
    expect(mockDownloadAsBase64).toHaveBeenCalledWith(
      'https://cdn.example.com/result.png',
    )
  })

  // ── Replicate: failed ─────────────────────────────────────────────────────

  it('AS-03: Replicate job failed → 500 + { status: "failed" }', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'failed',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).status).toBe('failed')
  })

  it('returns 500 when prediction is canceled', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'canceled',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).status).toBe('canceled')
  })

  // ── Google: succeeded ─────────────────────────────────────────────────────

  it('AS-04: Google job ready → returns inline base64 without downloading', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'succeeded',
      generatedBase64: 'data:image/png;base64,googleresult',
    })

    const res = await handler(
      makeCtx({ predictionId: 'job-abc', provider: 'google' }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('succeeded')
    expect((res.body as any).generatedImageBase64).toBe(
      'data:image/png;base64,googleresult',
    )
    // Google provides inline base64 — no download needed
    expect(mockDownloadAsBase64).not.toHaveBeenCalled()
  })

  // ── Google: still processing ──────────────────────────────────────────────

  it('AS-05: Google job not ready → 200 + { status: "processing" }', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'processing',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'job-abc', provider: 'google' }),
    )

    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('processing')
  })

  // ── Temp cleanup ──────────────────────────────────────────────────────────

  it('cleans up tempPath on success when tempPath is provided', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'succeeded',
      output: 'https://cdn.example.com/result.png',
    })

    await handler(
      makeCtx({
        predictionId: 'pred-123',
        provider: 'replicate',
        tempPath: 'temp/photo.png',
      }),
    )

    expect(mockStorageRemove).toHaveBeenCalledWith(['temp/photo.png'])
  })

  it('cleans up tempPath on failure when tempPath is provided', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'failed',
      output: null,
    })

    await handler(
      makeCtx({
        predictionId: 'pred-123',
        provider: 'replicate',
        tempPath: 'temp/photo.png',
      }),
    )

    expect(mockStorageRemove).toHaveBeenCalledWith(['temp/photo.png'])
  })

  it('does not call storage remove when tempPath is absent', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'succeeded',
      output: 'https://cdn.example.com/result.png',
    })

    await handler(makeCtx({ predictionId: 'pred-123', provider: 'replicate' }))

    expect(mockStorageRemove).not.toHaveBeenCalled()
  })

  // ── No output URL on Replicate succeeded ──────────────────────────────────

  it('AS-08: returns 500 when succeeded but extractUrl returns null', async () => {
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'succeeded',
      output: null,
    })
    mockExtractUrl.mockReturnValueOnce(null)

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).status).toBe('failed')
  })

  // ── Service throws ────────────────────────────────────────────────────────

  it('returns 500 when getPredictionStatus throws', async () => {
    mockGetPredictionStatus.mockRejectedValueOnce(
      new Error('DB connection failed'),
    )

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).error).toContain('DB connection failed')
  })

  it('returns 500 with generic message when a non-Error is thrown', async () => {
    mockGetPredictionStatus.mockRejectedValueOnce('unexpected string error')

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'replicate' }),
    )

    expect(res.status).toBe(500)
    expect((res.body as any).error).toBe('Internal server error')
  })

  // ── AS-09: unknown/invalid provider param ─────────────────────────────────

  it('AS-09: invalid provider param falls back to env-var default (no error)', async () => {
    // An unknown/missing provider param → AIGenerationService is instantiated
    // with undefined, falling back to AI_PROVIDER env var default
    mockGetPredictionStatus.mockResolvedValueOnce({
      status: 'processing',
      output: null,
    })

    const res = await handler(
      makeCtx({ predictionId: 'pred-123', provider: 'invalid-provider' }),
    )

    // The route clamps invalid provider to undefined, so no 4xx — it just proceeds
    expect(res.status).toBe(200)
    expect((res.body as any).status).toBe('processing')
  })
})
