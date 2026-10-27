const path = require('node:path')
const { execFileSync } = require('node:child_process')

const signAdHoc = ({ electronPlatformName, appOutDir, packager } = {}, { execFile = execFileSync } = {}) => {
  if (electronPlatformName !== 'darwin') return { signed: false, reason: 'not-macos' }
  const appName = packager?.appInfo?.productFilename
  if (typeof appName !== 'string' || !appName.trim()) throw new Error('macOS app product filename is unavailable')
  const appPath = path.join(appOutDir || '', `${appName}.app`)
  if (!appOutDir || !appPath.endsWith('.app')) throw new Error('macOS app output path is unavailable')
  execFile('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFile('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  return { signed: true, appPath }
}

module.exports = async function afterPack(context) {
  return signAdHoc(context)
}

module.exports.signAdHoc = signAdHoc
