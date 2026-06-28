const indexPath = require.resolve('./ipc/index')

delete require.cache[indexPath]

module.exports = require(indexPath)
