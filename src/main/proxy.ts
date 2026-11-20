import { session } from 'electron'

export const YANDEX_BYPASS_RULES = [
  '*.yandex.ru',
  '*.yandex.net',
  '*.yandex.com',
  '*.yandex.by',
  '*.yandex.kz',
  '*.yandex.uz',
  '*.music.yandex.net',
  '*.music.yandex.ru',
  '*.storage.yandex.net',
  '*.media.yandex.net',
  '*.passport.yandex.ru',
  '*.passport.yandex.com',
  '*.oauth.yandex.ru',
  '*.oauth.yandex.com',
  'yandex.ru',
  'yandex.net',
  'ya.ru',
  'ya.cc',
  '<local>'
].join(';')

let activeProxyRules: string | null = null

/**
 * Checks whether a proxy (system proxy, VPN or env proxy) is active.
 * If active, applies proxy configuration with explicit bypass rules for all Yandex services,
 * ensuring all Yandex traffic connects directly even when VPN / proxy is enabled.
 */
export async function syncProxySettings(ses: Electron.Session = session.defaultSession): Promise<void> {
  try {
    // Resolve proxy for an external service that typically requires/uses VPN in Russia
    const resolved = await ses.resolveProxy('https://music.youtube.com')

    let proxyRules: string | null = null
    if (resolved && !resolved.startsWith('DIRECT')) {
      const parts = resolved.split(';').map((p) => p.trim()).filter(Boolean)
      const valid = parts.find((p) => !p.startsWith('DIRECT'))
      if (valid) {
        const [scheme, addr] = valid.split(/\s+/)
        if (addr) {
          const s = scheme.toUpperCase()
          if (s.startsWith('SOCKS5')) {
            proxyRules = `socks5://${addr}`
          } else if (s.startsWith('SOCKS')) {
            proxyRules = `socks4://${addr}`
          } else {
            proxyRules = `http://${addr}`
          }
        } else {
          proxyRules = valid
        }
      }
    }

    if (!proxyRules) {
      const envProxy =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy
      if (envProxy) proxyRules = envProxy
    }

    if (proxyRules) {
      if (proxyRules !== activeProxyRules) {
        activeProxyRules = proxyRules
        await ses.setProxy({
          mode: 'fixed_servers',
          proxyRules,
          proxyBypassRules: YANDEX_BYPASS_RULES
        })
      }
    } else if (activeProxyRules !== null) {
      activeProxyRules = null
      await ses.setProxy({
        mode: 'system'
      })
    }
  } catch (error) {
    console.error('Error syncing proxy bypass rules:', error)
  }
}

/** Starts continuous sync of proxy rules (e.g. when user enables/disables VPN). */
export function startProxyBypassMonitor(ses: Electron.Session = session.defaultSession): () => void {
  void syncProxySettings(ses)
  const timer = setInterval(() => {
    void syncProxySettings(ses)
  }, 10_000)
  return () => clearInterval(timer)
}
