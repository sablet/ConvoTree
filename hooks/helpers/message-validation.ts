/**
 * Check if image URL is valid
 */
export function isValidImageUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  if (url.trim() === '' || url.includes('mockup_url') || url.includes('placeholder')) return false

  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/') || url.startsWith('data:')
}
