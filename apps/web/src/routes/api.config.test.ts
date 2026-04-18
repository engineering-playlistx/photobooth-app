import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_AUTH = 'Bearer test-secret'

function makeCtx(
  params: Record<string, string> = {},
  authHeader: string = VALID_AUTH,
) {
  const url = new URL('http://localhost/api/config')
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

const SAMPLE_CONFIG = {
  moduleFlow: [{ moduleId: 'welcome' }, { moduleId: 'camera' }],
  branding: { primaryColor: '#ff0000' },
}

describe('GET /api/config', () => {
  let handler: (ctx: any) => Promise<{
    body: unknown
    status: number
    headers?: Record<string, string>
  }>
  let mockSingle: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('API_CLIENT_KEY', 'test-secret')

    mockSingle = vi.fn().mockResolvedValue({
      data: { config_json: SAMPLE_CONFIG },
      error: null,
    })

    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

    vi.doMock('@tanstack/react-router', () => ({
      createFileRoute: () => (options: any) => {
        handler = options.server.handlers.GET
        return { options }
      },
    }))

    vi.doMock('@tanstack/react-start', () => ({
      json: (
        data: unknown,
        init?: { status?: number; headers?: Record<string, string> },
      ) => ({
        body: data,
        status: init?.status ?? 200,
        headers: init?.headers,
      }),
    }))

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    await import('./api.config')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    const ctx = {
      request: new Request('http://localhost/api/config?eventId=evt-1', {
        method: 'GET',
      }),
    }
    const res = await handler(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }, 'Bearer wrong-key'))
    expect(res.status).toBe(401)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('CF-02: returns 400 when eventId query param is missing', async () => {
    const res = await handler(makeCtx())
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/eventId/)
  })

  // ── Success ───────────────────────────────────────────────────────────────

  it('CF-01: valid eventId → 200 + full EventConfig shape', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(200)
    expect(res.body).toEqual(SAMPLE_CONFIG)
  })

  it('CF-04: response includes Cache-Control header with max-age', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(200)
    expect(res.headers?.['Cache-Control']).toContain('max-age=60')
  })

  it('CF-04: Cache-Control includes stale-while-revalidate', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.headers?.['Cache-Control']).toContain('stale-while-revalidate')
  })

  // ── Not found ─────────────────────────────────────────────────────────────

  it('CF-03: unknown eventId → 404', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'JSON object requested, multiple (or no) rows returned',
      },
    })

    const res = await handler(makeCtx({ eventId: 'unknown-evt' }))
    expect(res.status).toBe(404)
    expect((res.body as { error: string }).error).toMatch(/not found/i)
  })

  // ── Supabase errors ───────────────────────────────────────────────────────

  it('CF-05: non-PGRST116 Supabase error → 500', async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'INTERNAL', message: 'DB error' },
    })

    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 with error message when Supabase throws an exception', async () => {
    mockSingle.mockRejectedValueOnce(new Error('Connection timeout'))
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toContain(
      'Connection timeout',
    )
  })

  it('returns 500 with generic message when non-Error is thrown', async () => {
    mockSingle.mockRejectedValueOnce('unexpected string error')
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe('Internal server error')
  })
})
