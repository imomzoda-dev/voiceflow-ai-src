import type { DictationErrorCode } from '../../../shared/types'

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function httpErrorToCode(status: number): DictationErrorCode {
  if (status === 401 || status === 403) return 'invalid-key'
  if (status === 404) return 'provider-error'
  if (status === 408 || status === 504) return 'timeout'
  return 'provider-error'
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export function isLocalUrl(u: string): boolean {
  try {
    const url = new URL(u)
    return LOCAL_HOSTS.has(url.hostname) || url.hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

/**
 * Provider endpoints must be HTTPS, except loopback servers (Ollama, LM Studio, speaches…).
 * Certificate verification is never disabled.
 */
export function validateProviderUrl(u: string): { ok: true; url: string } | { ok: false; reason: string } {
  let url: URL
  try {
    url = new URL(u.trim())
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }
  if (url.username || url.password) return { ok: false, reason: 'Credentials in URL are not allowed' }
  if (url.protocol === 'https:') return { ok: true, url: url.toString().replace(/\/+$/, '') }
  if (url.protocol === 'http:' && isLocalUrl(url.toString())) return { ok: true, url: url.toString().replace(/\/+$/, '') }
  return { ok: false, reason: 'Use https:// (plain http is only allowed for localhost servers)' }
}
