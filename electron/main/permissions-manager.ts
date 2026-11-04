/**
 * OS permission status/requests. Nothing is requested at startup: the onboarding wizard and
 * settings ask for each permission with an explanation, one at a time.
 */
import { systemPreferences, shell } from 'electron'
import type { PermissionKind, PermissionStatus } from '../../shared/types'

const MAC_PANES: Record<PermissionKind, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  'input-monitoring': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent'
}

function mapMedia(s: string): PermissionStatus {
  if (s === 'granted' || s === 'denied' || s === 'restricted' || s === 'not-determined') return s
  return 'unknown'
}

export async function permissionStatus(): Promise<Record<PermissionKind, PermissionStatus>> {
  if (process.platform === 'darwin') {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false)
    return {
      microphone: mapMedia(systemPreferences.getMediaAccessStatus('microphone')),
      accessibility: trusted ? 'granted' : 'denied',
      // macOS has no public API to query Input Monitoring; the event tap failing to start is the signal.
      'input-monitoring': 'unknown'
    }
  }
  if (process.platform === 'win32') {
    return {
      microphone: mapMedia(systemPreferences.getMediaAccessStatus('microphone')),
      accessibility: 'not-required',
      'input-monitoring': 'not-required'
    }
  }
  return { microphone: 'unknown', accessibility: 'not-required', 'input-monitoring': 'not-required' }
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionStatus> {
  if (process.platform !== 'darwin') {
    if (kind === 'microphone' && process.platform === 'win32') {
      const s = mapMedia(systemPreferences.getMediaAccessStatus('microphone'))
      if (s === 'denied') await shell.openExternal('ms-settings:privacy-microphone')
      return s
    }
    return 'not-required'
  }
  if (kind === 'microphone') {
    const ok = await systemPreferences.askForMediaAccess('microphone')
    return ok ? 'granted' : 'denied'
  }
  if (kind === 'accessibility') {
    // Shows the system prompt that deep-links to Accessibility settings.
    return systemPreferences.isTrustedAccessibilityClient(true) ? 'granted' : 'denied'
  }
  await shell.openExternal(MAC_PANES['input-monitoring'])
  return 'unknown'
}

export async function openPermissionSettings(kind: PermissionKind) {
  if (process.platform === 'darwin') await shell.openExternal(MAC_PANES[kind])
  else if (process.platform === 'win32' && kind === 'microphone') await shell.openExternal('ms-settings:privacy-microphone')
}
