import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeCtx(body: unknown, authHeader?: string) {
  return {
    request: new Request('http://localhost/api/session/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader !== undefined ? { Authorization: authHeader } : {}),
      },
      body: JSON.stringify(body),
    }),
  }
}

describe('POST /api/session/start', () => {
  let handler: (ctx: any) => Promise<{ body: unknown; status: number }>
  let mockStartSession: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('API_CLIENT_KEY', 'test-secret-key')

    mockStartSession = vi.fn().mockResolvedValue({ sessionId: 'sess-abc-123' })

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

    vi.doMock('../repositories/session.repository', () => ({
      SessionRepository: vi.fn().mockImplementation(() => ({
        startSession: mockStartSession,
      })),
    }))

    await import('./api.session.start')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // ── Auth ─────────────────────────────────────────────────────────────────

  it('returns 401 when Authorization header is missing', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await handler(makeCtx({ eventId: 'evt-1' }, 'Bearer wrong-key'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization does not start with Bearer', async () => {
    const res = await handler(
      makeCtx({ eventId: 'evt-1' }, 'Token test-secret-key'),
    )
    expect(res.status).toBe(401)
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('S-04: returns 400 when eventId is missing', async () => {
    const res = await handler(makeCtx({}, 'Bearer test-secret-key'))
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/eventId/)
  })

  it('S-05: returns 400 when eventId is empty string', async () => {
    const res = await handler(
      makeCtx({ eventId: '   ' }, 'Bearer test-secret-key'),
    )
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/eventId/)
  })

  // ── Success ───────────────────────────────────────────────────────────────

  it('S-01: returns 200 with sessionId on valid request', async () => {
    const res = await handler(
      makeCtx({ eventId: 'evt-1' }, 'Bearer test-secret-key'),
    )
    expect(res.status).toBe(200)
    expect((res.body as { sessionId: string }).sessionId).toBe('sess-abc-123')
    expect(mockStartSession).toHaveBeenCalledWith('evt-1')
  })

  // ── Repository errors ─────────────────────────────────────────────────────

  it('S-06: returns 500 when repository throws', async () => {
    mockStartSession.mockRejectedValueOnce(new Error('DB connection failed'))
    const res = await handler(
      makeCtx({ eventId: 'evt-1' }, 'Bearer test-secret-key'),
    )
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toContain(
      'DB connection failed',
    )
  })

  it('S-07: returns 500 when unknown eventId causes FK violation', async () => {
    mockStartSession.mockRejectedValueOnce(
      new Error('violates foreign key constraint'),
    )
    const res = await handler(
      makeCtx({ eventId: 'unknown-evt' }, 'Bearer test-secret-key'),
    )
    expect(res.status).toBe(500)
  })

  it('returns 500 with generic message when a non-Error is thrown', async () => {
    mockStartSession.mockRejectedValueOnce('unexpected string error')
    const res = await handler(
      makeCtx({ eventId: 'evt-1' }, 'Bearer test-secret-key'),
    )
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe('Internal server error')
  })
})
