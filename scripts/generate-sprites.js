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
const { generateSpritesFromFrames } = require('../apps/desktop/src/services/sprite-generator')

const projectRoot = path.join(__dirname, '..')
const framesRoot = path.join(projectRoot, 'cat_anime', 'flames')
const spritesDir = path.join(projectRoot, 'cat_anime', 'sprites')
const configPath = path.join(projectRoot, 'cat_anime', 'animations.json')

async function main() {
  if (!fs.existsSync(framesRoot)) {
    console.error(`Frames root not found: ${framesRoot}`)
    process.exit(1)
  }

  const config = await generateSpritesFromFrames({ framesRoot, spritesDir, configPath })
  console.log(`\nGenerated ${configPath} with ${config.actions.length} actions`)
  console.log(`  defaultAction: ${config.defaultAction}`)
  console.log(`  clickAction: ${config.clickAction}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
