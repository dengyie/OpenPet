/**
 * 精灵图生成脚本 —— 将动作文件夹中的帧图片合成为水平精灵条。
 *
 * 为什么需要这个脚本：
 * — 手工拼接大量帧图片繁琐且容易出错。
 * — 自动按数字排序帧、统一 cell 尺寸、居中填充、生成 animations.json。
 * — 添加新动作只需把帧图片放入 flames/<action>/ 并运行此脚本。
 *
 * 输出：
 * — cat_anime/sprites/<action>.png（精灵图）
 * — cat_anime/animations.json（动作配置，供主进程读取）
 *
 * 用法：npm run generate-sprites
 */
const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const projectRoot = path.join(__dirname, '..')
const framesRoot = path.join(projectRoot, 'cat_anime', 'flames')
const spritesDir = path.join(projectRoot, 'cat_anime', 'sprites')
const configPath = path.join(projectRoot, 'cat_anime', 'animations.json')

// 文件夹名 → 中文标签的映射，未匹配的文件夹名会自动转换。
const actionLabels = {
  idle: '待机',
  bai_no_bg: '待机',
  eat_no_bg: '喂食'
}

// 判断文件是否为支持的图片格式。
const isImageFile = (fileName) => /\.(png|jpe?g|webp)$/i.test(fileName)

/**
 * 帧文件排序：提取文件名中的数字，按数字升序排列。
 * 例如 02_no_bg.png < 10_no_bg.png。
 */
const compareFrameName = (left, right) => {
  const leftNumber = Number(left.match(/\d+/)?.[0] || 0)
  const rightNumber = Number(right.match(/\d+/)?.[0] || 0)
  return leftNumber === rightNumber
    ? left.localeCompare(right)
    : leftNumber - rightNumber
}

/**
 * 将文件夹名转换为中文显示标签。
 * 去除 _no_bg 后缀，下划线/连字符替换为空格。
 */
const toActionLabel = (folderName) => {
  if (actionLabels[folderName]) return actionLabels[folderName]
  return folderName
    .replace(/_?no_?bg$/i, '')
    .replace(/[-_]+/g, ' ')
}

/**
 * 判断动作是否应该循环播放。
 * 待机（bai/idle）、站立（stand）、走路（walk）、显式标记 loop 的动作为循环。
 */
const isLoopAction = (folderName) => /(^idle$|bai|stand|walk|loop)/i.test(folderName)

/**
 * 处理单个动作文件夹：读取帧 → 计算最大尺寸 → 合成为精灵图。
 */
async function processAction(folderEntry) {
  const folderPath = path.join(framesRoot, folderEntry.name)
  const frameFiles = fs.readdirSync(folderPath)
    .filter(isImageFile)
    .sort(compareFrameName)

  if (!frameFiles.length) {
    console.warn(`  [skip] ${folderEntry.name}: no image files`)
    return null
  }

  // 收集所有帧的元数据（宽高、是否有透明通道）
  const metadatas = []
  for (const file of frameFiles) {
    try {
      const m = await sharp(path.join(folderPath, file)).metadata()
      metadatas.push(m)
    } catch (err) {
      console.warn(`  [skip] ${folderEntry.name}: cannot read ${file} (${err.message})`)
      return null
    }
  }

  // 无透明通道的图片不适合做桌面宠物（需要透明背景），跳过。
  if (!metadatas[0].hasAlpha) {
    console.warn(`  [skip] ${folderEntry.name}: no alpha channel`)
    return null
  }

  // 取所有帧的最大宽高作为统一 cell 尺寸，避免不同帧大小不一导致跳动。
  let maxW = 0
  let maxH = 0
  for (const m of metadatas) {
    if (m.width > maxW) maxW = m.width
    if (m.height > maxH) maxH = m.height
  }
  const cellW = maxW
  const cellH = maxH

  const frameCount = frameFiles.length

  // 将每帧居中填充后合成为水平精灵条
  const composites = []
  for (let i = 0; i < frameFiles.length; i++) {
    const m = metadatas[i]
    const leftPad = Math.floor((cellW - m.width) / 2)
    const topPad = Math.floor((cellH - m.height) / 2)

    const buf = await sharp(path.join(folderPath, frameFiles[i]))
      .ensureAlpha()
      .extend({
        top: topPad,
        bottom: cellH - m.height - topPad,
        left: leftPad,
        right: cellW - m.width - leftPad,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .raw()
      .toBuffer({ resolveWithObject: true })

    composites.push({
      input: buf.data,
      raw: { width: cellW, height: cellH, channels: 4 },
      left: i * cellW,
      top: 0
    })
  }

  const spritePath = path.join(spritesDir, `${folderEntry.name}.png`)
  await sharp({
    create: {
      width: cellW * frameCount,
      height: cellH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png()
    .toFile(spritePath)

  // eat 动作帧速稍快（85ms），其他动作用默认 95ms。
  const frameMs = /eat/i.test(folderEntry.name) ? 85 : 95

  console.log(`  [ok] ${folderEntry.name}: ${frameCount} frames (${cellW}x${cellH}) -> ${path.relative(process.cwd(), spritePath)}`)

  return {
    id: folderEntry.name,
    label: toActionLabel(folderEntry.name),
    loop: isLoopAction(folderEntry.name),
    frameMs,
    frameWidth: cellW,
    frameHeight: cellH,
    sprite: path.posix.join('cat_anime', 'sprites', `${folderEntry.name}.png`),
    frameCount
  }
}

async function main() {
  if (!fs.existsSync(framesRoot)) {
    console.error(`Frames root not found: ${framesRoot}`)
    process.exit(1)
  }

  if (!fs.existsSync(spritesDir)) {
    fs.mkdirSync(spritesDir, { recursive: true })
  }

  const entries = fs.readdirSync(framesRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())

  console.log(`Found ${entries.length} action directories in ${path.relative(process.cwd(), framesRoot)}`)

  // 逐个处理动作文件夹
  const actions = []
  for (const entry of entries) {
    const result = await processAction(entry)
    if (result) {
      actions.push(result)
    }
  }

  if (!actions.length) {
    console.error('No valid actions found.')
    process.exit(1)
  }

  // 自动选择默认动作（优先 idle/bai）和点击动作（优先 eat）
  const defaultAction = actions.find((a) => /^idle$/i.test(a.id))?.id
    || actions.find((a) => /bai/i.test(a.id))?.id
    || actions[0]?.id

  const clickAction = actions.find((a) => /eat/i.test(a.id))?.id
    || actions.find((a) => a.id !== defaultAction)?.id
    || defaultAction

  const config = { defaultAction, clickAction, actions }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  console.log(`\nGenerated ${configPath} with ${actions.length} actions`)
  console.log(`  defaultAction: ${defaultAction}`)
  console.log(`  clickAction: ${clickAction}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
