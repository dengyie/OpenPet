const electron = require('electron')
const {
  choosePetContextSubmenuPoint,
  estimatePetContextMenuSize
} = require('./pet-context-menu')

const MENU_INNER_PADDING = 6
const MENU_ROW_HEIGHT = 30
const MENU_DIVIDER_HEIGHT = 15

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const createMenuHtml = (items) => {
  const body = items.map((item, index) => {
    if (item.type === 'separator') return '<div class="separator" role="separator"></div>'
    return [
      `<button type="button" data-index="${index}" data-item-type="${escapeHtml(item.type || 'action')}" role="menuitem">`,
      `<span>${escapeHtml(item.label)}</span>`,
      item.type === 'submenu' ? '<span class="submenu-arrow" aria-hidden="true">›</span>' : '',
      '</button>'
    ].join('')
  }).join('')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    .menu {
      min-width: 112px;
      max-width: 220px;
      margin: 0;
      padding: 6px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow:
        inset 0 0 0 1px rgba(15, 23, 42, 0.13),
        0 18px 44px rgba(15, 23, 42, 0.2);
      color: #172033;
    }
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      min-height: 30px;
      padding: 0 12px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: default;
      white-space: nowrap;
    }
    .submenu-arrow {
      margin-left: 12px;
      color: rgba(15, 23, 42, 0.48);
      font-size: 12px;
    }
    button:hover, button:focus-visible {
      outline: none;
      background: rgba(37, 99, 235, 0.1);
      color: #123d91;
    }
    .separator {
      height: 1px;
      margin: 3px 4px;
      background: rgba(15, 23, 42, 0.12);
    }
  </style>
</head>
<body>
  <main class="menu" role="menu">${body}</main>
  <script>
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-index]')
      if (!button) return
      location.href = 'openpet-menu://select/' + encodeURIComponent(button.dataset.index)
    })
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') location.href = 'openpet-menu://close'
    })
  </script>
</body>
</html>`
}

const getMenuItemOffsetTop = (items, index) => {
  let offset = MENU_INNER_PADDING
  for (let cursor = 0; cursor < index; cursor += 1) {
    offset += items[cursor]?.type === 'separator' ? MENU_DIVIDER_HEIGHT : MENU_ROW_HEIGHT
  }
  return offset
}

const getWindowBounds = (menuWindow) => {
  if (typeof menuWindow?.getBounds === 'function') return menuWindow.getBounds()
  return {
    x: Number(menuWindow?.options?.x || 0),
    y: Number(menuWindow?.options?.y || 0),
    width: Number(menuWindow?.options?.width || 0),
    height: Number(menuWindow?.options?.height || 0)
  }
}

const clearSessionReferences = (session) => {
  const hostWindow = session.hostWindow
  if (!hostWindow) return
  if (!session.rootMenuWindow && hostWindow.contextMenuWindow) hostWindow.contextMenuWindow = null
  if (!session.rootMenuWindow && !session.submenuWindow && hostWindow.contextMenuSession === session) {
    hostWindow.contextMenuSession = null
  }
}

const closeMenuWindow = (menuWindow) => {
  if (!menuWindow || menuWindow.isDestroyed?.()) return
  menuWindow.close()
}

const createMenuSession = ({ BrowserWindow, hostWindow, onSelect }) => {
  const session = {
    BrowserWindow,
    hostWindow,
    onSelect,
    rootMenuWindow: null,
    submenuWindow: null,
    suppressBlurWindow: null,
    closeAll() {
      const rootMenuWindow = session.rootMenuWindow
      const submenuWindow = session.submenuWindow
      session.rootMenuWindow = null
      session.submenuWindow = null
      session.suppressBlurWindow = null
      clearSessionReferences(session)
      closeMenuWindow(submenuWindow)
      closeMenuWindow(rootMenuWindow)
    },
    closeSubmenu() {
      const submenuWindow = session.submenuWindow
      session.submenuWindow = null
      closeMenuWindow(submenuWindow)
      clearSessionReferences(session)
    }
  }
  if (hostWindow) hostWindow.contextMenuSession = session
  return session
}

const openMenuWindow = ({
  BrowserWindow,
  session,
  parentWindow,
  parentMenuWindow = null,
  items,
  point,
  size
}) => {
  let closed = false
  let menuWindow = null
  const removeParentListeners = () => {
    parentWindow?.removeListener?.('move', closeMenu)
    parentWindow?.removeListener?.('closed', closeMenu)
  }
  const closeMenu = () => {
    if (closed) return
    closed = true
    removeParentListeners()
    if (session.submenuWindow === menuWindow) session.submenuWindow = null
    if (session.rootMenuWindow === menuWindow) session.rootMenuWindow = null
    clearSessionReferences(session)
    if (!menuWindow.isDestroyed()) menuWindow.close()
  }
  menuWindow = new BrowserWindow({
    x: Math.round(point.x),
    y: Math.round(point.y),
    width: Math.round(size.width),
    height: Math.round(size.height),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    parent: parentWindow,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (parentMenuWindow) {
    session.submenuWindow = menuWindow
  } else {
    session.rootMenuWindow = menuWindow
    if (parentWindow) parentWindow.contextMenuWindow = menuWindow
  }

  menuWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (!url.startsWith('openpet-menu://')) return
    if (url.startsWith('openpet-menu://select/')) {
      const rawIndex = decodeURIComponent(url.slice('openpet-menu://select/'.length))
      const item = items[Number(rawIndex)]
      if (item?.type === 'submenu' && Array.isArray(item.submenu) && item.submenu.length > 0) {
        session.closeSubmenu()
        session.suppressBlurWindow = menuWindow
        const parentMenuBounds = getWindowBounds(menuWindow)
        const submenuSize = estimatePetContextMenuSize(item.submenu)
        const { workArea } = electron.screen?.getDisplayMatching?.(parentMenuBounds) || {
          workArea: {
            x: 0,
            y: 0,
            width: parentMenuBounds.x + parentMenuBounds.width + submenuSize.width + 64,
            height: Math.max(parentMenuBounds.y + parentMenuBounds.height, submenuSize.height) + 64
          }
        }
        const submenuPlacement = choosePetContextSubmenuPoint({
          parentMenuBounds,
          workArea,
          submenuSize,
          anchorOffsetTop: getMenuItemOffsetTop(items, Number(rawIndex)),
          anchorHeight: MENU_ROW_HEIGHT
        })
        openMenuWindow({
          BrowserWindow,
          session,
          parentWindow,
          parentMenuWindow: menuWindow,
          items: item.submenu,
          point: submenuPlacement.screenPoint,
          size: submenuSize
        })
        return
      }
      session.closeAll()
      if (item) session.onSelect?.(item)
      return
    }
    session.closeAll()
  })
  menuWindow.on('blur', () => {
    if (session.suppressBlurWindow === menuWindow) {
      session.suppressBlurWindow = null
      return
    }
    session.closeAll()
  })
  menuWindow.once('closed', closeMenu)
  parentWindow?.once?.('move', closeMenu)
  parentWindow?.once?.('closed', closeMenu)
  menuWindow.once('ready-to-show', () => {
    if (!menuWindow.isDestroyed()) {
      menuWindow.show()
      menuWindow.focus()
    }
  })
  menuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createMenuHtml(items))}`)

  return menuWindow
}

const showPetContextMenuWindow = ({
  BrowserWindow,
  parentWindow,
  items,
  point,
  size,
  onSelect
}) => {
  const session = createMenuSession({ BrowserWindow, hostWindow: parentWindow, onSelect })
  return openMenuWindow({
    BrowserWindow,
    session,
    parentWindow,
    items,
    point,
    size
  })
}

module.exports = {
  createMenuHtml,
  showPetContextMenuWindow
}
