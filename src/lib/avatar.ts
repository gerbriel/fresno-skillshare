import { supabase } from './supabase'

/* Profile photo upload for the avatars storage bucket. The bucket
   enforces the real limits (2 MB, image MIME types, own-folder RLS,
   see supabase/migrations/00021_avatar_uploads.sql); this resizes
   photos client-side so ordinary phone pictures fit under them. */

const MAX_DIMENSION = 512
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

/** For the file input's accept attribute. */
export const AVATAR_ACCEPT = ACCEPTED_TYPES.join(',')

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85))
}

/** Downscale to a web-friendly size; falls back to the original file. */
async function toUploadBlob(file: File): Promise<Blob> {
  // Resizing a GIF through canvas would freeze the animation, so a
  // small GIF is uploaded untouched (the size check still applies).
  if (file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    // Safari cannot always encode webp; fall back to jpeg.
    return (
      (await canvasToBlob(canvas, 'image/webp')) ??
      (await canvasToBlob(canvas, 'image/jpeg')) ??
      file
    )
  } catch {
    return file
  }
}

export interface AvatarUploadResult {
  url?: string
  error?: string
}

/** Uploads to avatars/<userId>/avatar and returns a cache-busted public URL. */
export async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { error: 'Please choose a JPEG, PNG, WebP, or GIF image.' }
  }

  const blob = await toUploadBlob(file)
  if (blob.size > MAX_UPLOAD_BYTES) {
    return { error: 'That image is too large. Please choose one under 2 MB.' }
  }

  const path = `${userId}/avatar`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, {
    upsert: true,
    contentType: blob.type || file.type,
    cacheControl: '3600',
  })
  if (error) {
    return { error: 'We could not upload that photo. Please try again.' }
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  // The object path never changes; the version param makes browsers refetch.
  return { url: `${data.publicUrl}?v=${Date.now()}` }
}

/** Removes the uploaded photo object. The caller clears profiles.avatar_url. */
export async function removeAvatar(userId: string): Promise<void> {
  await supabase.storage.from('avatars').remove([`${userId}/avatar`])
}
