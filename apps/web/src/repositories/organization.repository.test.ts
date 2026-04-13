import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('OrganizationRepository', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('findAll', () => {
    it('returns mapped organizations on success', async () => {
      const rows = [
        {
          id: 'org-1',
          name: 'Shell',
          slug: 'shell-racing',
          created_at: '2026-04-13T00:00:00Z',
        },
      ]
      const mockOrder = vi.fn().mockResolvedValue({ data: rows, error: null })
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.doMock('../utils/supabase-admin', () => ({
        getSupabaseAdminClient: () => ({ from: mockFrom }),
      }))

      const { OrganizationRepository } = await import(
        './organization.repository'
      )
      const repo = new OrganizationRepository()
      const result = await repo.findAll()

      expect(result).toEqual([
        {
          id: 'org-1',
          name: 'Shell',
          slug: 'shell-racing',
          createdAt: '2026-04-13T00:00:00Z',
        },
      ])
      expect(mockFrom).toHaveBeenCalledWith('organizations')
    })

    it('throws when Supabase returns an error', async () => {
      const mockOrder = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'db error' } })
      const mockSelect = vi.fn().mockReturnValue({ order: mockOrder })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.doMock('../utils/supabase-admin', () => ({
        getSupabaseAdminClient: () => ({ from: mockFrom }),
      }))

      const { OrganizationRepository } = await import(
        './organization.repository'
      )
      const repo = new OrganizationRepository()

      await expect(repo.findAll()).rejects.toThrow('db error')
    })
  })

  describe('findById', () => {
    it('returns null when not found (PGRST116)', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'not found' },
      })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.doMock('../utils/supabase-admin', () => ({
        getSupabaseAdminClient: () => ({ from: mockFrom }),
      }))

      const { OrganizationRepository } = await import(
        './organization.repository'
      )
      const repo = new OrganizationRepository()
      const result = await repo.findById('nonexistent')

      expect(result).toBeNull()
    })

    it('returns organization when found', async () => {
      const row = {
        id: 'org-1',
        name: 'Shell',
        slug: 'shell-racing',
        created_at: '2026-04-13T00:00:00Z',
      }
      const mockSingle = vi.fn().mockResolvedValue({ data: row, error: null })
      const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.doMock('../utils/supabase-admin', () => ({
        getSupabaseAdminClient: () => ({ from: mockFrom }),
      }))

      const { OrganizationRepository } = await import(
        './organization.repository'
      )
      const repo = new OrganizationRepository()
      const result = await repo.findById('org-1')

      expect(result).toEqual({
        id: 'org-1',
        name: 'Shell',
        slug: 'shell-racing',
        createdAt: '2026-04-13T00:00:00Z',
      })
    })
  })

  describe('create', () => {
    it('inserts and returns the new organization', async () => {
      const row = {
        id: 'org-2',
        name: 'Acme',
        slug: 'acme',
        created_at: '2026-04-13T00:00:00Z',
      }
      const mockSingle = vi.fn().mockResolvedValue({ data: row, error: null })
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
      const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
      const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })

      vi.doMock('../utils/supabase-admin', () => ({
        getSupabaseAdminClient: () => ({ from: mockFrom }),
      }))

      const { OrganizationRepository } = await import(
        './organization.repository'
      )
      const repo = new OrganizationRepository()
      const result = await repo.create({ name: 'Acme', slug: 'acme' })

      expect(result).toEqual({
        id: 'org-2',
        name: 'Acme',
        slug: 'acme',
        createdAt: '2026-04-13T00:00:00Z',
      })
      expect(mockInsert).toHaveBeenCalledWith({ name: 'Acme', slug: 'acme' })
    })
  })
})
