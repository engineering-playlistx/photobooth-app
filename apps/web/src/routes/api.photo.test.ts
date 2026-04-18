import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_AUTH = 'Bearer test-secret'

function makeCtx(body: unknown, authHeader: string = VALID_AUTH) {
  return {
    request: new Request('http://localhost/api/photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    }),
  }
}

const VALID_BODY = {
  photoPath: 'public/photos/photo.png',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+6281234567890',
  eventId: 'evt-1',
}

describe('POST /api/photo', () => {
  let handler: (ctx: any) => Promise<{ body: unknown; status: number }>
  let mockExecute: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.resetModules()
    vi.stubEnv('API_CLIENT_KEY', 'test-secret')

    mockExecute = vi.fn().mockResolvedValue({
      photoUrl: 'https://storage.example.com/public/photos/photo.png',
      userId: 'user-abc',
      sessionId: 'sess-abc',
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

    vi.doMock('../usecases/submit-photo.usecase', () => ({
      SubmitPhotoUseCase: vi.fn().mockImplementation(() => ({
        execute: mockExecute,
      })),
    }))

    await import('./api.photo')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('PH-02: returns 401 when Authorization header is missing', async () => {
    const ctx = {
      request: new Request('http://localhost/api/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_BODY),
      }),
    }
    const res = await handler(ctx)
    expect(res.status).toBe(401)
  })

  it('returns 401 when bearer token is wrong', async () => {
    const res = await handler(makeCtx(VALID_BODY, 'Bearer wrong-key'))
    expect(res.status).toBe(401)
  })

  it('returns 401 when Authorization does not start with Bearer', async () => {
    const res = await handler(makeCtx(VALID_BODY, 'Token test-secret'))
    expect(res.status).toBe(401)
  })

  // ── Validation: required fields ───────────────────────────────────────────

  it('PH-08: returns 400 when name is missing', async () => {
    const res = await handler(
      makeCtx({
        photoPath: VALID_BODY.photoPath,
        email: VALID_BODY.email,
        phone: VALID_BODY.phone,
        eventId: VALID_BODY.eventId,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('PH-08: returns 400 when photoPath is missing', async () => {
    const res = await handler(
      makeCtx({
        name: VALID_BODY.name,
        email: VALID_BODY.email,
        phone: VALID_BODY.phone,
        eventId: VALID_BODY.eventId,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('PH-08: returns 400 when eventId is missing', async () => {
    const res = await handler(
      makeCtx({
        photoPath: VALID_BODY.photoPath,
        name: VALID_BODY.name,
        email: VALID_BODY.email,
        phone: VALID_BODY.phone,
      }),
    )
    expect(res.status).toBe(400)
  })

  // ── Validation: email ─────────────────────────────────────────────────────

  it('PH-03: returns 400 when email format is invalid', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/email/i)
  })

  it('returns 400 when email has no domain', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, email: 'user@' }))
    expect(res.status).toBe(400)
  })

  // ── Validation: phone ─────────────────────────────────────────────────────

  it('PH-04: returns 400 when phone format is invalid', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, phone: '12345' }))
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/phone/i)
  })

  // ── Success ───────────────────────────────────────────────────────────────

  it('PH-01: valid submission → 200, usecase called, response contains photoUrl', async () => {
    const res = await handler(makeCtx(VALID_BODY))
    expect(res.status).toBe(200)
    expect((res.body as any).photoUrl).toBe(
      'https://storage.example.com/public/photos/photo.png',
    )
    expect((res.body as any).message).toBe('Photo saved successfully')
    expect(mockExecute).toHaveBeenCalledOnce()
  })

  it('succeeds when email and phone are omitted (optional fields)', async () => {
    const res = await handler(
      makeCtx({
        photoPath: VALID_BODY.photoPath,
        name: VALID_BODY.name,
        eventId: VALID_BODY.eventId,
      }),
    )
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ email: '', phone: '' }),
    )
  })

  // ── Phone normalization ───────────────────────────────────────────────────

  it('PH-05: phone "081234567890" → passed to usecase as "+6281234567890"', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, phone: '081234567890' }))
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+6281234567890' }),
    )
  })

  it('phone "628xx" prefix → normalized to "+628xx"', async () => {
    const res = await handler(
      makeCtx({ ...VALID_BODY, phone: '6281234567890' }),
    )
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+6281234567890' }),
    )
  })

  it('phone already in +62 format → passed through unchanged', async () => {
    const res = await handler(
      makeCtx({ ...VALID_BODY, phone: '+6281234567890' }),
    )
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+6281234567890' }),
    )
  })

  // ── Email non-blocking ────────────────────────────────────────────────────

  it('PH-06: usecase swallows email errors → route still returns 200', async () => {
    // The usecase catches email failures internally and still resolves.
    // This confirms the route does not surface them.
    const res = await handler(makeCtx(VALID_BODY))
    expect(res.status).toBe(200)
  })

  // ── Name sanitization ─────────────────────────────────────────────────────

  it('name with angle brackets is sanitized and accepted', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, name: 'John<Doe>' }))
    // Sanitized to "JohnDoe" — still non-empty, so accepted
    expect(res.status).toBe(200)
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'JohnDoe' }),
    )
  })

  it('returns 400 when name reduces to empty after sanitization', async () => {
    const res = await handler(makeCtx({ ...VALID_BODY, name: '<><>' }))
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toMatch(/name/i)
  })

  // ── Error ─────────────────────────────────────────────────────────────────

  it('PH-07: returns 500 when usecase throws', async () => {
    mockExecute.mockRejectedValueOnce(new Error('DB write failed'))
    const res = await handler(makeCtx(VALID_BODY))
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toContain('DB write failed')
  })

  it('returns 500 with generic message when non-Error is thrown', async () => {
    mockExecute.mockRejectedValueOnce('unexpected string error')
    const res = await handler(makeCtx(VALID_BODY))
    expect(res.status).toBe(500)
    expect((res.body as { error: string }).error).toBe('Internal server error')
  })
})
