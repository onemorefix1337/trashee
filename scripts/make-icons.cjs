// Renders resources/icon.svg and writes every icon the app and the installers need:
//   resources/icon.png, build/icon.png, build/icon.icns, build/icon.ico
// Run with: npm run icons   (uses Electron itself as the renderer, so no extra dependencies)
const { app, BrowserWindow, nativeImage } = require('electron')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const root = join(__dirname, '..')
const SIZE = 1024

/** ICNS entries are PNGs; the type code says which size (and density) a slot is for. */
const ICNS_SLOTS = [
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512]
]
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

function buildIcns(png) {
  const entries = ICNS_SLOTS.map(([type, size]) => {
    const data = png(size)
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(8 + data.length, 4)
    return Buffer.concat([header, data])
  })
  const total = 8 + entries.reduce((sum, entry) => sum + entry.length, 0)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 'ascii')
  header.writeUInt32BE(total, 4)
  return Buffer.concat([header, ...entries])
}

function buildIco(png) {
  const images = ICO_SIZES.map((size) => ({ size, data: png(size) }))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  let offset = 6 + images.length * 16
  const directory = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0)
    entry.writeUInt8(size >= 256 ? 0 : size, 1)
    entry.writeUInt16LE(1, 4) // colour planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(data.length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += data.length
    return entry
  })
  return Buffer.concat([header, ...directory, ...images.map((image) => image.data)])
}

app.whenReady().then(async () => {
  const svg = readFileSync(join(root, 'resources', 'icon.svg'), 'utf8')
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    webPreferences: { zoomFactor: 1 }
  })
  const html = `<!doctype html><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>${svg}`
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((resolve) => setTimeout(resolve, 300))

  const captured = await win.webContents.capturePage()
  const master = captured.resize({ width: SIZE, height: SIZE, quality: 'best' })
  const png = (size) =>
    (size === SIZE ? master : master.resize({ width: size, height: size, quality: 'best' })).toPNG()

  // The corner must be transparent, or the squircle would sit on a black square.
  const corner = nativeImage.createFromBuffer(png(64)).toBitmap()[3]
  console.log('corner alpha (expect 0):', corner)

  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'resources', 'icon.png'), png(SIZE))
  writeFileSync(join(root, 'build', 'icon.png'), png(SIZE))
  writeFileSync(join(root, 'build', 'icon.icns'), buildIcns(png))
  writeFileSync(join(root, 'build', 'icon.ico'), buildIco(png))
  console.log('icons written')
  app.quit()
})
