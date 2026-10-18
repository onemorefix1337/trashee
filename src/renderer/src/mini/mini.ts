import {
  MINI_LYRICS_HEIGHT,
  miniArtSize,
  type MiniCommand,
  type MiniLook,
  type MiniTrack
} from '../../../shared/mini'
import { coverUrl, dominantColor } from '../lib/cover'
import './mini.css'

const IDLE_TITLE = 'Нет воспроизведения'
const SLIDE_OUT_MS = 160
const HIDE_ANIMATION_MS = 210
const ACCENT_BOOST = 1.9

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

const shell = $('shell')
const artWrap = $('art-wrap')
const artImg = $<HTMLImageElement>('art-img')
const artPlaceholder = $('art-ph')
const eq = $('eq-wrap')
const bars = [...document.querySelectorAll<HTMLElement>('.bar')]
const playButton = $('pbtn')
const likeButton = $('btn-like')
const expandButton = $('expand')

/** Fades a line out, swaps its text, and slides it back in; nothing happens if the text is the same. */
function setText(element: HTMLElement, text: string): void {
  if (element.textContent === text) return
  element.classList.remove('slide-in', 'slide-out')
  void element.offsetWidth
  element.classList.add('slide-out')
  setTimeout(() => {
    element.textContent = text
    element.classList.remove('slide-out')
    element.classList.add('slide-in')
  }, SLIDE_OUT_MS)
}

/** The cover's color, brightened so it reads on the dark card. */
function setAccent(rgb: [number, number, number] | null): void {
  const style = document.documentElement.style
  if (!rgb) {
    style.removeProperty('--ac')
    return
  }
  const peak = Math.max(...rgb) || 1
  const gain = Math.min(255 / peak, ACCENT_BOOST)
  const [r, g, b] = rgb.map((channel) => Math.min(255, Math.round(channel * gain)))
  style.setProperty('--ac', `rgb(${r}, ${g}, ${b})`)
}

let activeBackground = 1
function setBackground(url: string | null): void {
  const incoming = $(activeBackground === 1 ? 'bg2' : 'bg1')
  const outgoing = $(activeBackground === 1 ? 'bg1' : 'bg2')
  incoming.style.backgroundImage = url ? `url("${url}")` : 'none'
  incoming.style.opacity = url ? '1' : '0'
  outgoing.style.opacity = '0'
  activeBackground = activeBackground === 1 ? 2 : 1
}

let shownCover: string | null | undefined
function showCover(coverUri: string | undefined): void {
  if (coverUri === shownCover) return
  shownCover = coverUri
  const url = coverUri ? coverUrl({ coverUri }, '200x200') : null

  if (!url) {
    artImg.style.opacity = '0'
    setTimeout(() => {
      if (shownCover === undefined) artPlaceholder.style.opacity = '1'
    }, 320)
    setBackground(null)
    setAccent(null)
    return
  }

  artImg.style.opacity = '0'
  artPlaceholder.style.opacity = '0'
  const probe = new Image()
  probe.onload = () => {
    if (shownCover !== coverUri) return // a newer track already replaced this one
    artImg.src = url
    artImg.style.transition = 'none'
    artImg.style.transform = 'scale(0.85)'
    void artImg.offsetWidth
    artImg.style.transition = 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.34, 1.4, 0.64, 1)'
    artImg.style.opacity = '1'
    artImg.style.transform = 'scale(1)'
    setBackground(url)
    void dominantColor(url).then((rgb) => shownCover === coverUri && setAccent(rgb))
  }
  probe.src = url
}

/** Opacity, size and the open lyrics line, as the main process decided them. */
let lyricsOpen = false
function applyLook(look: MiniLook): void {
  const style = document.documentElement.style
  style.setProperty('--a', String(look.opacity))
  style.setProperty('--art', `${miniArtSize(look.height)}px`)
  style.setProperty('--band', `${MINI_LYRICS_HEIGHT}px`)
  lyricsOpen = look.lyrics
  shell.classList.toggle('lyrics-open', lyricsOpen)
  expandButton.setAttribute('aria-expanded', String(lyricsOpen))
  const label = lyricsOpen ? 'Скрыть строку текста' : 'Показать строку текста'
  expandButton.title = label
  expandButton.setAttribute('aria-label', label)
}

let lastPlaying: boolean | null = null
let lastLiked: boolean | null = null

function render(track: MiniTrack | null): void {
  setText($('track-name'), track?.title || IDLE_TITLE)
  setText($('artist-name'), track?.artist ?? '')
  setText($('lyric-line'), track?.line ?? '')

  const playing = track?.playing === true
  if (playing !== lastPlaying) {
    lastPlaying = playing
    $('i-play').style.display = playing ? 'none' : ''
    $('i-pause').style.display = playing ? '' : 'none'
    artWrap.classList.toggle('playing', playing)
  }
  bars.forEach((bar) => bar.classList.toggle('p', !playing))
  eq.classList.toggle('on', playing && !!track?.coverUri)

  const liked = track?.liked === true
  if (liked !== lastLiked) {
    lastLiked = liked
    likeButton.classList.toggle('liked', liked)
  }
  showCover(track?.coverUri)
}

function send(command: MiniCommand): void {
  window.mini.command(command)
}

document.querySelectorAll<HTMLElement>('[data-cmd]').forEach((button) => {
  button.addEventListener('click', () => {
    const command = button.dataset.cmd as MiniCommand
    if (command === 'toggle') {
      playButton.classList.remove('pop')
      void playButton.offsetWidth
      playButton.classList.add('pop')
    }
    send(command)
  })
})
expandButton.addEventListener('click', () => window.mini.setLyrics(!lyricsOpen))
$('open').addEventListener('click', () => send('open'))
$('close').addEventListener('click', () => window.mini.close())

window.mini.onLook(applyLook)
window.mini.onState(render)
window.mini.onShow(() => {
  shell.classList.remove('out')
  shell.style.animation = 'none'
  void shell.offsetWidth
  shell.style.animation = ''
})
window.mini.onHide(() => {
  shell.classList.add('out')
  setTimeout(() => window.mini.hidden(), HIDE_ANIMATION_MS)
})

render(null)
