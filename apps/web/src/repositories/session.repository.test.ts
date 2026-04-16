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

describe('SessionRepository.updatePhotoPath', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls update with photo_path and eq with sessionId', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()
    await repo.updatePhotoPath('sess-abc', 'events/evt1/photos/photo.png')

    expect(mockFrom).toHaveBeenCalledWith('sessions')
    expect(mockUpdate).toHaveBeenCalledWith({
      photo_path: 'events/evt1/photos/photo.png',
    })
    expect(mockEq).toHaveBeenCalledWith('id', 'sess-abc')
  })

  it('throws when Supabase returns an error', async () => {
    const mockEq = vi
      .fn()
      .mockResolvedValue({ error: { message: 'update failed' } })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()

    await expect(
      repo.updatePhotoPath('sess-abc', 'events/evt1/photos/photo.png'),
    ).rejects.toThrow('update failed')
  })
})

describe('SessionRepository.completeSession', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates all fields including status=completed and module_outputs', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()

    const completeData = {
      photoPath: 'events/evt1/photos/photo.png',
      userInfo: { name: 'Alice', email: 'alice@example.com', phone: '+62111' },
      moduleOutputs: { selectedTheme: { id: 'pitcrew' } },
    }

    await repo.completeSession('sess-abc', completeData)

    expect(mockFrom).toHaveBeenCalledWith('sessions')
    expect(mockUpdate).toHaveBeenCalledWith({
      photo_path: 'events/evt1/photos/photo.png',
      user_info: { name: 'Alice', email: 'alice@example.com', phone: '+62111' },
      module_outputs: { selectedTheme: { id: 'pitcrew' } },
      status: 'completed',
    })
    expect(mockEq).toHaveBeenCalledWith('id', 'sess-abc')
  })

  it('throws when Supabase returns an error', async () => {
    const mockEq = vi
      .fn()
      .mockResolvedValue({ error: { message: 'complete failed' } })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdate })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ from: mockFrom }),
    }))

    const { SessionRepository } = await import('./session.repository')
    const repo = new SessionRepository()

    await expect(
      repo.completeSession('sess-abc', {
        photoPath: 'events/evt1/photos/photo.png',
        userInfo: {
          name: 'Alice',
          email: 'alice@example.com',
          phone: '+62111',
        },
        moduleOutputs: {},
      }),
    ).rejects.toThrow('complete failed')
  })
})
