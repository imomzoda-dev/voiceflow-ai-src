import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Meter } from '@/components/ui/misc'
import { startLevelMeter } from '@/services/audio/mic-recorder'
import { useSettings } from '@/stores'

/** Device picker + live input meter. Opens the mic only while the test runs. */
export function MicTest({ showPicker = true }: { showPicker?: boolean }) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const update = useSettings((s) => s.update)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const stop = useRef<(() => void) | null>(null)

  const refresh = async () => {
    const list = await navigator.mediaDevices.enumerateDevices()
    setDevices(list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications'))
  }

  useEffect(() => {
    void refresh()
    navigator.mediaDevices.addEventListener('devicechange', refresh)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refresh)
      stop.current?.()
    }
  }, [])

  const toggle = async () => {
    if (testing) {
      stop.current?.()
      stop.current = null
      setTesting(false)
      setLevel(0)
      return
    }
    setError(null)
    try {
      stop.current = await startLevelMeter(settings.voice.microphoneId, setLevel)
      setTesting(true)
      void refresh() // labels become available after permission is granted
    } catch (e) {
      setError((e as DOMException).name === 'NotAllowedError' ? t('settings.voice.micPermissionDenied') : t('errors.mic-unavailable'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showPicker && (
        <Select
          className="w-full"
          value={settings.voice.microphoneId ?? '__default'}
          onChange={(v) => {
            void update('voice', { microphoneId: v === '__default' ? null : v })
            if (testing) {
              stop.current?.()
              setTesting(false)
            }
          }}
          label={t('settings.voice.microphone')}
          options={[{ value: '__default', label: t('settings.voice.systemDefault') }, ...devices.map((d, i) => ({ value: d.deviceId, label: d.label || `${t('settings.voice.microphone')} ${i + 1}` }))]}
        />
      )}
      <div className="flex items-center gap-3">
        <Button variant={testing ? 'record' : 'secondary'} onClick={() => void toggle()}>
          {testing ? <Square size={13} fill="currentColor" /> : <Mic size={14} />}
          {testing ? t('settings.voice.stopTest') : t('settings.voice.testMic')}
        </Button>
        <div className="flex flex-1 items-center gap-2">
          <span className="w-[86px] shrink-0 text-[12px] text-muted">{t('settings.voice.level')}</span>
          <Meter value={level} />
        </div>
      </div>
      {error && <div className="text-[12.5px] text-danger">{error}</div>}
    </div>
  )
}
