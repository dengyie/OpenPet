const fs = require('node:fs')
const path = require('node:path')

const createPluginAssetPathController = ({
  ensureCreatorDirs,
  assertDirectoryHasNoSymlinks,
  selectCreatorAssetFrameFolder
} = {}) => {
  if (typeof ensureCreatorDirs !== 'function') throw new Error('ensureCreatorDirs is required')
  if (typeof assertDirectoryHasNoSymlinks !== 'function') throw new Error('assertDirectoryHasNoSymlinks is required')
  if (typeof selectCreatorAssetFrameFolder !== 'function') throw new Error('selectCreatorAssetFrameFolder is required')

  const assertSafeRelativePath = (relativePath, message) => {
    if (typeof relativePath !== 'string' || !relativePath.trim()) {
      throw new Error(`${message} relative path is required`)
    }
    const normalized = relativePath.replace(/\\/g, '/')
    if (
      normalized.startsWith('/') ||
      /^[a-zA-Z]:\//.test(normalized) ||
      normalized.includes('\0') ||
      normalized.split('/').includes('..')
    ) {
      throw new Error(`${message} path must be a safe relative path`)
    }
    return normalized
  }

  const resolvePluginAssetPath = (manifest, relativePath) => {
    if (!manifest.basePath) throw new Error('Plugin assets require a local plugin directory')
    const normalized = assertSafeRelativePath(relativePath, 'Plugin asset')
    const basePath = path.resolve(manifest.basePath)
    const targetPath = path.resolve(basePath, normalized)
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error('Plugin asset path must stay inside the plugin directory')
    }
    if (!fs.existsSync(targetPath)) throw new Error('Plugin asset path does not exist')
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error('Plugin asset path must stay inside the plugin directory')
    }
    if (!fs.statSync(realTargetPath).isDirectory()) throw new Error('Plugin asset path must be a folder')
    assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const resolvePluginDataPath = (manifest, relativePath) => {
    const normalized = assertSafeRelativePath(relativePath, 'Plugin data')
    const { dataDir } = ensureCreatorDirs(manifest)
    const basePath = path.resolve(dataDir)
    const targetPath = path.resolve(basePath, normalized)
    if (targetPath !== basePath && !targetPath.startsWith(`${basePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    if (!fs.existsSync(targetPath)) throw new Error('Plugin data path does not exist')
    const realTargetPath = fs.realpathSync(targetPath)
    const realBasePath = fs.realpathSync(basePath)
    if (realTargetPath !== realBasePath && !realTargetPath.startsWith(`${realBasePath}${path.sep}`)) {
      throw new Error('Plugin data path must stay inside plugin data directory')
    }
    if (fs.statSync(realTargetPath).isDirectory()) assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const resolvePickedAssetPath = (sourceDir) => {
    if (typeof sourceDir !== 'string' || !sourceDir.trim()) {
      throw new Error('Selected frame folder is required')
    }
    const targetPath = path.resolve(sourceDir)
    if (!fs.existsSync(targetPath)) throw new Error('Selected frame folder does not exist')
    if (fs.lstatSync(targetPath).isSymbolicLink()) throw new Error('Selected frame folder must not be a symlink')
    const realTargetPath = fs.realpathSync(targetPath)
    if (!fs.statSync(realTargetPath).isDirectory()) throw new Error('Selected frame folder must be a folder')
    assertDirectoryHasNoSymlinks(realTargetPath)
    return realTargetPath
  }

  const selectCreatorAssetSourceDir = async () => {
    const selected = await selectCreatorAssetFrameFolder()
    if (selected?.canceled || !selected?.sourceDir) return { canceled: true }
    return { canceled: false, sourceDir: resolvePickedAssetPath(selected.sourceDir) }
  }

  return {
    ensureCreatorDirs,
    resolvePluginAssetPath,
    resolvePluginDataPath,
    resolvePickedAssetPath,
    selectCreatorAssetSourceDir
  }
}

module.exports = {
  createPluginAssetPathController
}
