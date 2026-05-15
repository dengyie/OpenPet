/**
 * 动作配置模块 —— 从 animations.json 读取动作列表。
 *
 * 为什么独立存在：
 * — 动作配置由 npm run generate-sprites 自动生成，不是手写代码。
 * — 主进程需要向渲染进程提供动作列表，而渲染进程无权直接读文件系统。
 * — 独立模块让这层"文件 → 内存 → IPC"转换职责清晰。
 */
const fs = require('fs')
const path = require('path')

const configPath = path.join(__dirname, '..', '..', 'cat_anime', 'animations.json')

/**
 * 读取精灵图生成脚本输出的动作配置，返回安全的纯数据对象。
 * 文件缺失或解析失败时返回空列表，不抛异常。
 */
const getPetAnimations = () => {
  try {
    if (!fs.existsSync(configPath)) {
      return { defaultAction: '', clickAction: '', actions: [] }
    }
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return {
      defaultAction: config.defaultAction || '',
      clickAction: config.clickAction || '',
      actions: config.actions || []
    }
  } catch (error) {
    console.error('Failed to load animations config:', error)
    return { defaultAction: '', clickAction: '', actions: [] }
  }
}

module.exports = { getPetAnimations }
