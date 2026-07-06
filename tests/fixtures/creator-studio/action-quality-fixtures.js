const sharp = require('sharp')

const DEFAULT_CELL_WIDTH = 256
const DEFAULT_CELL_HEIGHT = 256

const getSheetLayout = (frameCount) => {
  const columns = frameCount === 6 ? 3 : Math.max(1, Math.min(4, frameCount))
  const rows = Math.max(1, Math.ceil(frameCount / columns))
  return { columns, rows }
}

const catSvg = ({
  cellWidth = DEFAULT_CELL_WIDTH,
  cellHeight = DEFAULT_CELL_HEIGHT,
  bodyOffsetX = 0,
  bodyOffsetY = 0,
  pawAngle = 0,
  pawLift = 0,
  eyeOpen = 1
} = {}) => {
  const cx = cellWidth / 2
  const bodyCy = 154 + bodyOffsetY
  const headCy = 92 + bodyOffsetY
  const eyeScale = Math.max(0.08, Math.min(1, eyeOpen))
  return `
    <svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${bodyOffsetX} 0)">
        <ellipse cx="${cx}" cy="${bodyCy}" rx="58" ry="68" fill="#d89b45" />
        <circle cx="${cx}" cy="${headCy}" r="48" fill="#e0a856" />
        <circle cx="${cx - 30}" cy="${headCy - 38}" r="19" fill="#d99d49" />
        <circle cx="${cx + 30}" cy="${headCy - 38}" r="19" fill="#d99d49" />
        <ellipse cx="${cx}" cy="${bodyCy + 16}" rx="28" ry="42" fill="#f2dcc0" opacity="0.9" />
        <ellipse cx="${cx - 16}" cy="${headCy + 2}" rx="8" ry="${8 * eyeScale}" fill="#4f8c42" />
        <ellipse cx="${cx + 16}" cy="${headCy + 2}" rx="8" ry="${8 * eyeScale}" fill="#4f8c42" />
        <ellipse cx="${cx}" cy="${headCy + 18}" rx="10" ry="7" fill="#f2dcc0" />
        <circle cx="${cx}" cy="${headCy + 16}" r="3" fill="#7b4b2a" />
        <ellipse cx="${cx - 24}" cy="${bodyCy + 64}" rx="18" ry="10" fill="#c98735" />
        <ellipse cx="${cx + 24}" cy="${bodyCy + 64}" rx="18" ry="10" fill="#c98735" />
        <g transform="rotate(${pawAngle} ${cx + 38} ${bodyCy - 16 - pawLift})">
          <ellipse cx="${cx + 38}" cy="${bodyCy - 16 - pawLift}" rx="13" ry="38" fill="#c98735" />
          <circle cx="${cx + 38}" cy="${bodyCy - 52 - pawLift}" r="13" fill="#d89b45" />
        </g>
        <ellipse cx="${cx - 38}" cy="${bodyCy + 2}" rx="13" ry="38" fill="#c98735" />
      </g>
    </svg>
  `
}

const writeSheet = async ({ filePath, frameCount, frameSvg }) => {
  const { columns, rows } = getSheetLayout(frameCount)
  const composites = Array.from({ length: frameCount }, (_entry, index) => ({
    input: Buffer.from(frameSvg(index)),
    left: (index % columns) * DEFAULT_CELL_WIDTH,
    top: Math.floor(index / columns) * DEFAULT_CELL_HEIGHT
  }))

  await sharp({
    create: {
      width: columns * DEFAULT_CELL_WIDTH,
      height: rows * DEFAULT_CELL_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(filePath)
}

const writeBadStaticActionSheet = ({ filePath, frameCount = 6 }) => writeSheet({
  filePath,
  frameCount,
  frameSvg: () => catSvg()
})

const writeGoodSubtleWaveSheet = ({ filePath, frameCount = 6 }) => {
  const wave = [
    { pawLift: 0, pawAngle: 0, eyeOpen: 1 },
    { pawLift: 16, pawAngle: -8, eyeOpen: 1 },
    { pawLift: 34, pawAngle: -17, eyeOpen: 1 },
    { pawLift: 34, pawAngle: 12, eyeOpen: 0.86 },
    { pawLift: 26, pawAngle: -12, eyeOpen: 1 },
    { pawLift: 6, pawAngle: 3, eyeOpen: 1 }
  ]
  return writeSheet({
    filePath,
    frameCount,
    frameSvg: (index) => catSvg(wave[index % wave.length])
  })
}

module.exports = {
  writeBadStaticActionSheet,
  writeGoodSubtleWaveSheet
}
