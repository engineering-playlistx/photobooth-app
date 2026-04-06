import { useRef, useState } from 'react'
import { createServerFn } from '@tanstack/react-start'
import { getSupabaseAdminClient } from '../utils/supabase-admin'
import { SUPABASE_BUCKET } from '../utils/constants'

// ---------------------------------------------------------------------------
// Server function
// ---------------------------------------------------------------------------

export const uploadAssetFn = createServerFn({ method: 'POST' }).handler(
  async (ctx) => {
    const { eventId, assetType, filename, fileBase64, mimeType } = ctx.data as {
      eventId: string
      assetType: 'frames' | 'templates' | 'backgrounds' | 'logos'
      filename: string
      fileBase64: string
      mimeType: string
    }
    const admin = getSupabaseAdminClient()
    const uploadPath = `events/${eventId}/${assetType}/${filename}`
    const binary = atob(fileBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const { error } = await admin.storage
      .from(SUPABASE_BUCKET)
      .upload(uploadPath, bytes, { contentType: mimeType, upsert: true })
    if (error) throw new Error(error.message)
    const { data } = admin.storage
      .from(SUPABASE_BUCKET)
      .getPublicUrl(uploadPath)
    return { publicUrl: data.publicUrl }
  },
)

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.split(',')[1] ?? result
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

// ---------------------------------------------------------------------------
// AssetSlot component
// ---------------------------------------------------------------------------

interface AssetSlotProps {
  label: string
  currentUrl: string | null | undefined
  onUpload: (file: File) => Promise<void>
  onRemove?: () => Promise<void>
}

export function AssetSlot({
  label,
  currentUrl,
  onUpload,
  onRemove,
}: AssetSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    if (!onRemove) return
    setRemoving(true)
    setError(null)
    try {
      await onRemove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setRemoving(false)
    }
  }

  const busy = uploading || removing

  return (
    <div className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
      <div className="w-16 h-16 shrink-0 bg-slate-800 rounded border border-slate-600 flex items-center justify-center overflow-hidden">
        {currentUrl?.startsWith('http') ? (
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-slate-600 text-xs text-center px-1 break-all">
            {currentUrl ?? 'Not set'}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-300 mb-1">{label}</p>
        {currentUrl && !currentUrl.startsWith('http') && (
          <p className="text-xs text-slate-500 truncate mb-1">{currentUrl}</p>
        )}
        {error && <p className="text-xs text-red-400 mb-1">{error}</p>}
      </div>
      <div className="shrink-0 flex flex-col gap-1.5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void handleChange(e)
          }}
        />
        <button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {onRemove && currentUrl && (
          <button
            disabled={busy}
            onClick={() => void handleRemove()}
            className="px-3 py-1.5 text-xs bg-transparent hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed text-red-400 hover:text-red-300 rounded transition-colors border border-red-800/50"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>
    </div>
  )
}
