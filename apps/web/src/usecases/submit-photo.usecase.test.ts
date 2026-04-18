import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Shared mock builders
// ---------------------------------------------------------------------------

function makeUserRepoMock(overrides: Record<string, unknown> = {}) {
  return {
    UserRepository: vi.fn().mockImplementation(() => ({
      createUser: vi.fn().mockResolvedValue({
        id: 'user-abc',
        name: 'Alice',
        email: 'alice@example.com',
        phone: '+62811111111',
        photo_path: 'events/evt1/photos/photo.png',
        selected_theme: 'pitcrew',
        created_at: '2026-04-19T00:00:00Z',
        visit_count: 1,
        ...overrides,
      }),
    })),
  }
}

function makeSessionRepoMock() {
  return {
    SessionRepository: vi.fn().mockImplementation(() => ({
      completeSession: vi.fn().mockResolvedValue(undefined),
      createSession: vi.fn().mockResolvedValue(undefined),
    })),
  }
}

function makeEmailServiceMock() {
  return {
    EmailService: vi.fn().mockImplementation(() => ({
      sendPhotoEmail: vi.fn().mockResolvedValue(undefined),
    })),
  }
}

function makeSupabaseMock(publicUrl = 'https://storage.example.com/photo.png') {
  return {
    getSupabaseAdminClient: () => ({
      storage: {
        from: vi.fn().mockReturnValue({
          getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl } }),
        }),
      },
    }),
  }
}

// Base happy-path request
const BASE_REQUEST = {
  photoPath: 'events/evt1/photos/photo.png',
  name: 'Alice',
  email: 'alice@example.com',
  phone: '+62811111111',
  selectedTheme: 'pitcrew',
  eventId: 'evt-001',
  sessionId: 'sess-xyz',
  moduleOutputs: { selectedTheme: { id: 'pitcrew' } },
}

describe('SubmitPhotoUseCase.execute', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // UC-01
  it('happy path: creates user, completes session, sends email, returns photoUrl + userId', async () => {
    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => makeSessionRepoMock())
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () =>
      makeSupabaseMock(
        'https://storage.example.com/events/evt1/photos/photo.png',
      ),
    )
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    const result = await useCase.execute(BASE_REQUEST)

    expect(result.photoUrl).toBe(
      'https://storage.example.com/events/evt1/photos/photo.png',
    )
    expect(result.userId).toBe('user-abc')
    expect(result.sessionId).toBe('sess-xyz')
  })

  // UC-01 — completeSession called with correct args when sessionId is provided
  it('calls completeSession (not createSession) when sessionId is provided', async () => {
    const sessionRepoMock = makeSessionRepoMock()
    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => sessionRepoMock)
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()
    await useCase.execute(BASE_REQUEST)

    const sessionInstance =
      sessionRepoMock.SessionRepository.mock.results[0].value
    expect(sessionInstance.completeSession).toHaveBeenCalledOnce()
    expect(sessionInstance.completeSession).toHaveBeenCalledWith(
      'sess-xyz',
      expect.objectContaining({
        photoPath: 'events/evt1/photos/photo.png',
        userInfo: {
          name: 'Alice',
          email: 'alice@example.com',
          phone: '+62811111111',
        },
      }),
    )
    expect(sessionInstance.createSession).not.toHaveBeenCalled()
  })

  // UC-06
  it('calls createSession (not completeSession) when no sessionId is provided', async () => {
    const sessionRepoMock = makeSessionRepoMock()
    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => sessionRepoMock)
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    const requestWithoutSession = { ...BASE_REQUEST, sessionId: undefined }
    const result = await useCase.execute(requestWithoutSession)

    const sessionInstance =
      sessionRepoMock.SessionRepository.mock.results[0].value
    expect(sessionInstance.createSession).toHaveBeenCalledOnce()
    expect(sessionInstance.completeSession).not.toHaveBeenCalled()

    // Returns a generated UUID as sessionId
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  // UC-02
  it('email failure is non-blocking: still returns success when email throws', async () => {
    const emailMock = {
      EmailService: vi.fn().mockImplementation(() => ({
        sendPhotoEmail: vi.fn().mockRejectedValue(new Error('SMTP timeout')),
      })),
    }

    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => makeSessionRepoMock())
    vi.doMock('../services/email.service', () => emailMock)
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    // Should not throw
    const result = await useCase.execute(BASE_REQUEST)
    expect(result.userId).toBe('user-abc')
    expect(result.photoUrl).toBeDefined()
  })

  it('skips sending email when email field is empty string', async () => {
    const emailMock = makeEmailServiceMock()
    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => makeSessionRepoMock())
    vi.doMock('../services/email.service', () => emailMock)
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    await useCase.execute({ ...BASE_REQUEST, email: '' })

    const emailInstance = emailMock.EmailService.mock.results[0].value
    expect(emailInstance.sendPhotoEmail).not.toHaveBeenCalled()
  })

  // UC-03
  it('throws when UserRepository.createUser fails', async () => {
    vi.doMock('../repositories/user.repository', () => ({
      UserRepository: vi.fn().mockImplementation(() => ({
        createUser: vi.fn().mockRejectedValue(new Error('DB write error')),
      })),
    }))
    vi.doMock('../repositories/session.repository', () => makeSessionRepoMock())
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    await expect(useCase.execute(BASE_REQUEST)).rejects.toThrow(
      'DB write error',
    )
  })

  // UC-04
  it('throws when SessionRepository.completeSession fails', async () => {
    vi.doMock('../repositories/user.repository', () => makeUserRepoMock())
    vi.doMock('../repositories/session.repository', () => ({
      SessionRepository: vi.fn().mockImplementation(() => ({
        completeSession: vi
          .fn()
          .mockRejectedValue(new Error('Session not found')),
        createSession: vi.fn().mockResolvedValue(undefined),
      })),
    }))
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    await expect(useCase.execute(BASE_REQUEST)).rejects.toThrow(
      'Session not found',
    )
  })

  // UC-05
  it('passes phone as-is to UserRepository (normalization done at route layer)', async () => {
    const userRepoMock = makeUserRepoMock()
    vi.doMock('../repositories/user.repository', () => userRepoMock)
    vi.doMock('../repositories/session.repository', () => makeSessionRepoMock())
    vi.doMock('../services/email.service', () => makeEmailServiceMock())
    vi.doMock('../utils/supabase-admin', () => makeSupabaseMock())
    vi.doMock('../utils/constants', () => ({
      SUPABASE_BUCKET: 'photobooth-bucket',
    }))

    const { SubmitPhotoUseCase } = await import('./submit-photo.usecase')
    const useCase = new SubmitPhotoUseCase()

    await useCase.execute({ ...BASE_REQUEST, phone: '+62811111111' })

    const userInstance = userRepoMock.UserRepository.mock.results[0].value
    expect(userInstance.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+62811111111' }),
    )
  })
})
