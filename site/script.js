// trashee site: reveal on scroll, hero tilt, a self-driving screenshot showcase,
// and download buttons that point at the files of the latest GitHub release.
;(() => {
  const REPO = 'onemorefix1337/trashee'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (selector, root = document) => root.querySelector(selector)
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)]

  document.documentElement.classList.remove('no-js')

  /* ───── reveal on scroll ───── */
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('in')
        reveal.unobserve(entry.target)
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  )
  $$('.reveal').forEach((element) => reveal.observe(element))

  /* ───── header gets a backdrop once the page moves ───── */
  const header = $('.header')
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 8)
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  /* ───── the bars along the bottom of the hero ───── */
  const spectrum = $('#spectrum')
  if (spectrum) {
    const count = Math.max(18, Math.min(72, Math.floor(innerWidth / 18)))
    for (let i = 0; i < count; i++) {
      const bar = document.createElement('i')
      // Taller towards the middle, like the spectrum of a real track.
      const middle = 1 - Math.abs(i / (count - 1) - 0.5) * 1.1
      bar.style.setProperty('--h', (0.12 + Math.random() * 0.22).toFixed(2))
      bar.style.setProperty('--l', (0.3 + Math.random() * 0.7 * middle).toFixed(2))
      bar.style.setProperty('--t', `${(0.9 + Math.random() * 1.4).toFixed(2)}s`)
      bar.style.setProperty('--s', `${(-Math.random() * 2).toFixed(2)}s`)
      spectrum.append(bar)
    }
  }

  /* ───── hero window follows the pointer ───── */
  const tilt = $('#tilt')
  if (tilt && !reduced && matchMedia('(hover: hover)').matches) {
    const visual = tilt.parentElement
    visual.addEventListener('pointermove', (event) => {
      const box = visual.getBoundingClientRect()
      const x = (event.clientX - box.left) / box.width - 0.5
      const y = (event.clientY - box.top) / box.height - 0.5
      tilt.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`
    })
    visual.addEventListener('pointerleave', () => {
      tilt.style.transform = ''
    })
  }

  /* ───── light that follows the cursor on feature cards ───── */
  $$('.feature').forEach((card) => {
    card.addEventListener('pointermove', (event) => {
      const box = card.getBoundingClientRect()
      card.style.setProperty('--mx', `${event.clientX - box.left}px`)
      card.style.setProperty('--my', `${event.clientY - box.top}px`)
    })
  })

  /* ───── screenshot showcase ───── */
  const showcase = $('#showcase-root')
  if (showcase) {
    const tabs = $$('.tab', showcase)
    const frames = $$('.frame', showcase)
    const DWELL_SECONDS = 6
    let current = 0

    const show = (index) => {
      current = (index + tabs.length) % tabs.length
      tabs.forEach((tab) => tab.classList.remove('active'))
      void showcase.offsetWidth // lets the progress bar start over
      tabs.forEach((tab, i) => {
        const on = i === current
        tab.setAttribute('aria-selected', String(on))
        tab.tabIndex = on ? 0 : -1
        if (on) {
          tab.style.setProperty('--dwell', `${DWELL_SECONDS}s`)
          tab.classList.add('active')
          // On narrow screens the tabs scroll sideways; keep the active one in view.
          tab.parentElement.scrollTo({
            left: tab.offsetLeft - tab.parentElement.clientWidth / 2 + tab.clientWidth / 2,
            behavior: reduced ? 'auto' : 'smooth'
          })
        }
      })
      frames.forEach((frame, i) => frame.classList.toggle('active', i === current))
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => show(i))
      // When the progress bar fills up, move on to the next screenshot.
      tab.addEventListener('animationend', (event) => {
        if (event.pseudoElement === '::after' && tab.classList.contains('active')) show(current + 1)
      })
      tab.addEventListener('keydown', (event) => {
        const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
        if (!step) return
        event.preventDefault()
        show(current + step)
        tabs[current].focus()
      })
    })
    show(0)

    // No point in cycling screenshots nobody can see.
    new IntersectionObserver(([entry]) => {
      showcase.style.setProperty('--run', entry.isIntersecting ? 'running' : 'paused')
    }).observe(showcase)
  }

  /* ───── downloads ───── */
  const platform = () => {
    const agent = navigator.userAgent.toLowerCase()
    const hint = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase()
    if (/android/.test(agent)) return 'android'
    if (/iphone|ipad|ipod/.test(agent)) return 'mobile'
    // iPadOS pretends to be a Mac.
    if (hint.includes('mac') && navigator.maxTouchPoints > 1) return 'mobile'
    if (hint.includes('mac') || agent.includes('mac os')) return 'mac'
    if (hint.includes('win') || agent.includes('windows')) return 'win'
    if (hint.includes('linux') || agent.includes('linux') || agent.includes('x11')) return 'linux'
    return 'other'
  }

  const os = platform()
  const HERO_LABEL = {
    android: 'Скачать для Android',
    mac: 'Скачать для macOS',
    win: 'Скачать для Windows',
    linux: 'Скачать для Linux',
    mobile: 'Скачать на компьютер',
    other: 'Скачать'
  }
  const heroLink = $('#hero-download')
  const heroLabel = $('#hero-download-label')
  if (heroLabel) heroLabel.textContent = HERO_LABEL[os]
  $(`.dl[data-os="${os}"]`)?.classList.add('recommended')

  // Which downloaded file belongs to which button. File names carry the version, so match by shape.
  const ASSETS = {
    macArm: /mac-arm64\.dmg$/,
    macX64: /mac-x64\.dmg$/,
    win: /win-setup\.exe$/,
    appImage: /\.AppImage$/,
    tarGz: /linux-x64\.tar\.gz$/,
    sums: /SHA256SUMS\.txt$/
  }
  // The Android app has releases of its own, tagged android-v1.2.3, in the same repository.
  const ANDROID_ASSETS = {
    apk: /\.apk$/,
    sumsAndroid: /SHA256SUMS\.txt$/
  }
  const buttons = {}
  $$('[data-asset]').forEach((element) => (buttons[element.dataset.asset] ??= []).push(element))
  // On Windows, Linux and Android the big button in the hero downloads the file straight away.
  const direct = { win: 'win', linux: 'appImage', android: 'apk' }[os]
  if (heroLink && direct) (buttons[direct] ??= []).push(heroLink)

  const formatSize = (bytes) => `${Math.round(bytes / 1048576)} МБ`

  // Not "latest": that would be whichever release came last, and the Android app has releases of its own.
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(response.status))))
    .then((releases) => {
      const published = releases.filter((release) => !release.draft && !release.prerelease)
      const desktop = published.find((release) => /^v\d/.test(release.tag_name))
      const android = published.find((release) => /^android-v\d/.test(release.tag_name))

      const wire = (release, patterns) => {
        const assets = release?.assets ?? []
        for (const [key, pattern] of Object.entries(patterns)) {
          const asset = assets.find((candidate) => pattern.test(candidate.name))
          if (!asset) continue
          for (const element of buttons[key] ?? []) {
            element.href = asset.browser_download_url
            const note = $('small', element)
            if (note) note.textContent = `${note.textContent.split(' · ')[0]} · ${formatSize(asset.size)}`
          }
        }
      }
      wire(desktop, ASSETS)
      wire(android, ANDROID_ASSETS)

      const versionOf = (release) => String(release?.tag_name ?? '').replace(/^(android-)?v/i, '')
      const version = versionOf(desktop)
      const androidVersion = versionOf(android)
      const label = $('#version')
      if (label && version) label.textContent = `Версия ${version}${androidVersion ? ` · Android ${androidVersion}` : ''}`
      const line = $('#release-line')
      if (line && desktop?.published_at) {
        // Russian dates already end with "г.", so the sentence must not add a second dot.
        const date = new Date(desktop.published_at)
          .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
          .replace(/\.$/, '')
        line.textContent = `Версия ${version} от ${date}${androidVersion ? `, для Android ${androidVersion}` : ''}. Бесплатно, регистрация не нужна.`
      }
    })
    .catch(() => {
      // GitHub unreachable or rate-limited: the buttons keep pointing at the releases page.
    })
})()
