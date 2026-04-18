import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('UserRepository.createUser', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // UR-01
  it('calls upsert_user_with_visit_count RPC with correct params and returns user', async () => {
    const fakeUser = {
      id: 'user-123',
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+62811111111',
      photo_path: 'events/evt1/photos/photo.png',
      selected_theme: 'pitcrew',
      created_at: '2026-04-19T00:00:00Z',
      visit_count: 1,
    }

    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: fakeUser, error: null })
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ rpc: mockRpc }),
    }))

    const { UserRepository } = await import('./user.repository')
    const repo = new UserRepository()

    const result = await repo.createUser({
      name: 'Alice',
      email: 'alice@example.com',
      phone: '+62811111111',
      photoPath: 'events/evt1/photos/photo.png',
      selectedTheme: 'pitcrew',
      eventId: 'evt-001',
    })

    expect(result).toEqual(fakeUser)
  })

  // UR-03
  it('maps camelCase input to snake_case RPC params', async () => {
    const fakeUser = {
      id: 'user-456',
      name: 'Bob',
      email: 'bob@example.com',
      phone: '+62822222222',
      photo_path: 'events/evt2/photos/photo.png',
      selected_theme: 'motogp',
      created_at: '2026-04-19T00:00:00Z',
      visit_count: 2,
    }

    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: fakeUser, error: null })
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ rpc: mockRpc }),
    }))

    const { UserRepository } = await import('./user.repository')
    const repo = new UserRepository()

    await repo.createUser({
      name: 'Bob',
      email: 'bob@example.com',
      phone: '+62822222222',
      photoPath: 'events/evt2/photos/photo.png',
      selectedTheme: 'motogp',
      eventId: 'evt-002',
    })

    expect(mockRpc).toHaveBeenCalledWith('upsert_user_with_visit_count', {
      p_name: 'Bob',
      p_email: 'bob@example.com',
      p_phone: '+62822222222',
      p_photo_path: 'events/evt2/photos/photo.png',
      p_selected_theme: 'motogp',
      p_event_id: 'evt-002',
    })
  })

  it('defaults email to empty string when not provided', async () => {
    const fakeUser = {
      id: 'user-789',
      name: 'Charlie',
      email: '',
      phone: '+62833333333',
      photo_path: 'events/evt3/photos/photo.png',
      selected_theme: null,
      created_at: '2026-04-19T00:00:00Z',
      visit_count: 1,
    }

    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: fakeUser, error: null })
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ rpc: mockRpc }),
    }))

    const { UserRepository } = await import('./user.repository')
    const repo = new UserRepository()

    await repo.createUser({
      name: 'Charlie',
      photoPath: 'events/evt3/photos/photo.png',
    })

    expect(mockRpc).toHaveBeenCalledWith(
      'upsert_user_with_visit_count',
      expect.objectContaining({
        p_email: '',
        p_phone: '',
        p_selected_theme: null,
        p_event_id: null,
      }),
    )
  })

  // UR-02
  it('throws when Supabase RPC returns an error', async () => {
    const mockSingle = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'rpc failed' } })
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ rpc: mockRpc }),
    }))

    const { UserRepository } = await import('./user.repository')
    const repo = new UserRepository()

    await expect(
      repo.createUser({
        name: 'Alice',
        photoPath: 'events/evt1/photos/photo.png',
      }),
    ).rejects.toThrow('Failed to create user: rpc failed')
  })

  it('throws when RPC returns no data (null user)', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockRpc = vi.fn().mockReturnValue({ single: mockSingle })

    vi.doMock('../utils/supabase-admin', () => ({
      getSupabaseAdminClient: () => ({ rpc: mockRpc }),
    }))

    const { UserRepository } = await import('./user.repository')
    const repo = new UserRepository()

    await expect(
      repo.createUser({
        name: 'Alice',
        photoPath: 'events/evt1/photos/photo.png',
      }),
    ).rejects.toThrow('Failed to create user: No data returned')
  })
})
