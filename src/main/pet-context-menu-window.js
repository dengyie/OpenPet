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
      `<button type="button" data-index="${index}" role="menuitem">`,
      `<span>${escapeHtml(item.label)}</span>`,
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

const showPetContextMenuWindow = ({
  BrowserWindow,
  parentWindow,
  items,
  point,
  size,
  onSelect
}) => {
  let closed = false
  const removeParentListeners = () => {
    parentWindow?.removeListener?.('move', closeMenu)
    parentWindow?.removeListener?.('closed', closeMenu)
  }
  const closeMenu = () => {
    if (closed) return
    closed = true
    removeParentListeners()
    if (parentWindow?.contextMenuWindow === menuWindow) parentWindow.contextMenuWindow = null
    if (!menuWindow.isDestroyed()) menuWindow.close()
  }
  const menuWindow = new BrowserWindow({
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
  if (parentWindow) parentWindow.contextMenuWindow = menuWindow

  menuWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (!url.startsWith('openpet-menu://')) return
    if (url.startsWith('openpet-menu://select/')) {
      const rawIndex = decodeURIComponent(url.slice('openpet-menu://select/'.length))
      const item = items[Number(rawIndex)]
      closeMenu()
      if (item) onSelect?.(item)
      return
    }
    closeMenu()
  })
  menuWindow.on('blur', closeMenu)
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

module.exports = {
  createMenuHtml,
  showPetContextMenuWindow
}
