/**
 * 原子 JSON 文件写入工具。
 *
 * 提供原子写入保证：tmp+rename 防止并发覆盖或崩溃导致的部分文件，
 * 写入带 flush 保证落盘，失败时清理临时文件后再抛错。
 *
 * 从 settings.js 提取。当前采用方：settings.js、ai-talk-store.js、
 * pet-pack-service.js、creator-workflow-service.js。
 *
 * 以下两处保留各自实现，不要"顺手"合并进来：
 *  - system-cursor-service.js：写 helper 配置需要 mode 0o600 + 写后 chmod，
 *    该文件可能含 loopback token，权限收紧是安全要求而非风格差异。
 *  - hatch-pet-agent-store.js：写入前要过 sanitizeAgentArtifact()，且用注入的
 *    fsImpl（测试替身）而非直接 require('fs')。
 */
const fs = require('fs')
const path = require('path')

/**
 * 原子写入 JSON 文件。
 *
 * @param {string} filePath - 目标路径
 * @param {*} value - 可序列化值
 * @throws {Error} 当目录创建或写入失败时抛错（调用方可记录诊断）
 */
const writeJsonAtomic = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf-8',
      flush: true
    })
    fs.renameSync(temporaryPath, filePath)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch (_) {}
    throw error
  }
}

module.exports = { writeJsonAtomic }
