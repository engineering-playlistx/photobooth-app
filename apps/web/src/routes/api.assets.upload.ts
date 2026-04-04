import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../utils/constants'

const ALLOWED_ASSET_TYPES = [
  'frames',
  'templates',
  'backgrounds',
  'logos',
] as const
type AssetType = (typeof ALLOWED_ASSET_TYPES)[number]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get('Authorization')
  if (!apiKey?.startsWith('Bearer ')) return false
  const providedKey = apiKey.split(' ')[1]
  const expectedKey = process.env.API_CLIENT_KEY
  if (!expectedKey) return false
  return providedKey === expectedKey
}

function isAllowedAssetType(value: string): value is AssetType {
  return (ALLOWED_ASSET_TYPES as ReadonlyArray<string>).includes(value)
}

export const Route = createFileRoute('/api/assets/upload')({
  server: {
    handlers: {
      POST: async (ctx) => {
        try {
          if (!validateApiKey(ctx.request)) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          const formData = await ctx.request.formData()
          const file = formData.get('file')
          const eventId = formData.get('eventId')
          const assetType = formData.get('assetType')
          const filename = formData.get('filename')

          if (!eventId || !assetType || !filename || !file) {
            return json({ error: 'Missing required fields' }, { status: 400 })
          }

          if (
            typeof eventId !== 'string' ||
            typeof assetType !== 'string' ||
            typeof filename !== 'string'
          ) {
            return json({ error: 'Invalid field types' }, { status: 400 })
          }

          if (!isAllowedAssetType(assetType)) {
            return json(
              {
                error: `Invalid assetType. Must be one of: ${ALLOWED_ASSET_TYPES.join(', ')}`,
              },
              { status: 400 },
            )
          }

          if (!(file instanceof File)) {
            return json(
              { error: 'file must be a binary upload' },
              { status: 400 },
            )
          }

          if (file.size > MAX_FILE_SIZE) {
            return json({ error: 'File exceeds 10MB limit' }, { status: 400 })
          }

          const uploadPath = `events/${eventId}/${assetType}/${filename}`
          const supabase = getSupabaseAdminClient()

          const { error: uploadError } = await supabase.storage
            .from(SUPABASE_BUCKET)
            .upload(uploadPath, file, { upsert: true, contentType: file.type })

          if (uploadError) {
            return json({ error: uploadError.message }, { status: 500 })
          }

          const { data } = supabase.storage
            .from(SUPABASE_BUCKET)
            .getPublicUrl(uploadPath)

          return json({ publicUrl: data.publicUrl })
        } catch (error) {
          console.error({ message: 'Asset upload error', error })
          return json({ error: 'Internal server error' }, { status: 500 })
        }
      },
    },
  },
})
