const { registerSystemAboutIpc } = require('./register-system-about-ipc')
const { registerSystemCatalogIpc } = require('./register-system-catalog-ipc')
const { registerSystemServiceIpc } = require('./register-system-service-ipc')

const registerSystemIpc = (context) => {
  registerSystemServiceIpc(context)
  registerSystemAboutIpc(context)
  registerSystemCatalogIpc(context)
}

module.exports = {
  registerSystemIpc
}
