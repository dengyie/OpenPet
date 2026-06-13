/**
 * Generate platform icon assets from the canonical PNG.
 *
 * The Windows ICO file stores PNG-encoded images at multiple sizes. This keeps
 * the generated binary reproducible without adding another icon toolchain.
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.join(__dirname, '..')
const inputPng = path.join(projectRoot, 'build', 'icon.png')
const outputIco = path.join(projectRoot, 'build', 'icon.ico')
const iconSizes = [256, 128, 64, 48, 32, 16]

function writeIconDirectoryEntry(buffer, offset, image, imageOffset) {
  const sizeByte = image.size >= 256 ? 0 : image.size

  buffer.writeUInt8(sizeByte, offset)
  buffer.writeUInt8(sizeByte, offset + 1)
  buffer.writeUInt8(0, offset + 2)
  buffer.writeUInt8(0, offset + 3)
  buffer.writeUInt16LE(1, offset + 4)
  buffer.writeUInt16LE(32, offset + 6)
  buffer.writeUInt32LE(image.buffer.length, offset + 8)
  buffer.writeUInt32LE(imageOffset, offset + 12)
}

async function createIco() {
  if (!fs.existsSync(inputPng)) {
    throw new Error(`Icon source not found: ${inputPng}`)
  }

  const images = []
  for (const size of iconSizes) {
    const buffer = await sharp(inputPng)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toBuffer()

    images.push({ size, buffer })
  }

  const headerSize = 6
  const directoryEntrySize = 16
  const directorySize = headerSize + images.length * directoryEntrySize
  const totalSize = directorySize + images.reduce((sum, image) => sum + image.buffer.length, 0)
  const ico = Buffer.alloc(totalSize)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(images.length, 4)

  let imageOffset = directorySize
  images.forEach((image, index) => {
    writeIconDirectoryEntry(ico, headerSize + index * directoryEntrySize, image, imageOffset)
    image.buffer.copy(ico, imageOffset)
    imageOffset += image.buffer.length
  })

  fs.writeFileSync(outputIco, ico)
  console.log(`Generated ${outputIco} (${images.map((image) => `${image.size}x${image.size}`).join(', ')})`)
}

createIco().catch((err) => {
  console.error(err)
  process.exit(1)
})
