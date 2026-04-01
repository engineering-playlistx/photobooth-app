import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('SessionRepository.startSession', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a sessionId on success and inserts correct data', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()
    const result = await repo.startSession('evt_shell_001')

    expect(result).toHaveProperty('sessionId')
    expect(typeof result.sessionId).toBe('string')
    expect(result.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )

    expect(mockFrom).toHaveBeenCalledWith('sessions')
    expect(mockInsert).toHaveBeenCalledWith({
      id: result.sessionId,
      event_id: 'evt_shell_001',
      status: 'in_progress',
    })
  })

  it('throws an error when Supabase insert fails', async () => {
    const mockInsert = vi
      .fn()
      .mockResolvedValue({ error: { message: 'db error' } })
    const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()

    await expect(repo.startSession('evt_shell_001')).rejects.toThrow('db error')
  })
})
