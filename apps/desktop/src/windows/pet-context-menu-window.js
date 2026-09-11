const electron = require('electron')
const {
  MENU_METRICS,
  constrainPetContextMenuSize,
  layoutPetContextSubmenu,
  measurePetContextMenu
} = require('./pet-context-menu-layout')

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const createMenuHtml = (items, { scrollable = false } = {}) => {
  const body = items.map((item, index) => {
    if (item.type === 'separator') return '<div class="separator" role="separator"></div>'
    return [
      `<button type="button" data-index="${index}" data-item-type="${escapeHtml(item.type || 'action')}" role="menuitem">`,
      `<span class="label">${escapeHtml(item.label)}</span>`,
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
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: transparent;
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    }
    .menu {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: ${MENU_METRICS.padding}px;
      overflow-x: hidden;
      overflow-y: ${scrollable ? 'auto' : 'hidden'};
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.98);
      box-shadow:
        inset 0 0 0 1px rgba(15, 23, 42, 0.1),
        0 14px 30px rgba(15, 23, 42, 0.08);
      color: #1f2937;
      scrollbar-width: thin;
    }
    button {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: ${MENU_METRICS.rowHeight}px;
      min-height: ${MENU_METRICS.rowHeight}px;
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
      transition: background 120ms ease, color 120ms ease;
    }
    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .submenu-arrow {
      flex: none;
      margin-left: 12px;
      color: rgba(15, 23, 42, 0.42);
      font-size: 12px;
    }
    button:hover, button:focus-visible {
      outline: none;
      background: rgba(111, 92, 255, 0.12);
      color: #5a48d6;
    }
    .separator {
      height: ${MENU_METRICS.separatorHeight}px;
      margin: ${MENU_METRICS.separatorMargin}px 4px;
      background: rgba(15, 23, 42, 0.1);
    }
  </style>
</head>
<body>
  <main class="menu" role="menu">${body}</main>
  <script>
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-index]')
      if (!button) {
        location.href = 'openpet-menu://close'
        return
      }
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
  let offset = MENU_METRICS.padding
  for (let cursor = 0; cursor < index; cursor += 1) {
    offset += items[cursor]?.type === 'separator'
      ? MENU_METRICS.separatorBlockHeight
      : MENU_METRICS.rowHeight
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

const isLiveWindow = (menuWindow) => Boolean(menuWindow && !menuWindow.isDestroyed?.())

const closeMenuWindow = (menuWindow) => {
  if (isLiveWindow(menuWindow)) menuWindow.close()
}

const createMenuSession = ({
  BrowserWindow,
  hostWindow,
  onSelect,
  onSubmenuOpen,
  screenService,
  scheduleTask,
  cancelTask
}) => {
  const closeFromHost = () => session.closeAll()
  const session = {
    BrowserWindow,
    hostWindow,
    onSelect,
    onSubmenuOpen,
    screenService,
    scheduleTask,
    cancelTask,
    rootMenuWindow: null,
    submenuWindow: null,
    submenuKey: null,
    dismissTask: null,
    closing: false,
    cancelPendingDismiss() {
      if (session.dismissTask == null) return
      session.cancelTask(session.dismissTask)
      session.dismissTask = null
    },
    isMenuFocused() {
      return [session.rootMenuWindow, session.submenuWindow]
        .some((menuWindow) => isLiveWindow(menuWindow) && menuWindow.isFocused?.())
    },
    scheduleDismissIfUnfocused() {
      session.cancelPendingDismiss()
      session.dismissTask = session.scheduleTask(() => {
        session.dismissTask = null
        if (!session.isMenuFocused()) session.closeAll()
      })
    },
    clearHostReferences() {
      if (!hostWindow) return
      if (hostWindow.contextMenuSession !== session) return
      if (!session.rootMenuWindow) hostWindow.contextMenuWindow = null
      if (!session.rootMenuWindow && !session.submenuWindow) {
        hostWindow.contextMenuSession = null
      }
    },
    detachHostListeners() {
      hostWindow?.removeListener?.('move', closeFromHost)
      hostWindow?.removeListener?.('closed', closeFromHost)
    },
    handleWindowClosed(menuWindow) {
      if (session.closing) return
      if (session.submenuWindow === menuWindow) {
        session.submenuWindow = null
        session.submenuKey = null
      }
      if (session.rootMenuWindow === menuWindow) {
        session.rootMenuWindow = null
        session.closeSubmenu()
        session.detachHostListeners()
      }
      session.clearHostReferences()
    },
    closeSubmenu() {
      const submenuWindow = session.submenuWindow
      session.submenuWindow = null
      session.submenuKey = null
      closeMenuWindow(submenuWindow)
      session.clearHostReferences()
    },
    closeAll() {
      if (session.closing) return
      session.closing = true
      session.cancelPendingDismiss()
      const rootMenuWindow = session.rootMenuWindow
      const submenuWindow = session.submenuWindow
      session.rootMenuWindow = null
      session.submenuWindow = null
      session.submenuKey = null
      session.detachHostListeners()
      session.clearHostReferences()
      closeMenuWindow(submenuWindow)
      closeMenuWindow(rootMenuWindow)
      session.closing = false
    }
  }

  hostWindow?.once?.('move', closeFromHost)
  hostWindow?.once?.('closed', closeFromHost)
  if (hostWindow) hostWindow.contextMenuSession = session
  return session
}

const createSubmenuCandidateDiagnostics = (candidate, workArea, size) => ({
  placement: candidate.placement,
  screenPoint: candidate.point,
  idealPoint: candidate.idealPoint,
  overlapArea: candidate.petOverlapArea,
  petOverlapArea: candidate.petOverlapArea,
  parentOverlapArea: candidate.parentOverlapArea,
  overflowArea: candidate.overflowArea,
  idealOverflowArea: candidate.idealOverflowArea,
  fitsIdeal: candidate.fitsIdeal,
  fitsHorizontally: (
    candidate.idealPoint.x >= workArea.x + MENU_METRICS.screenMargin
    && candidate.idealPoint.x + size.width <= workArea.x + workArea.width - MENU_METRICS.screenMargin
  )
})

const openMenuWindow = ({ session, items, layout, submenuKey = null }) => {
  const parentWindow = session.hostWindow
  const menuWindow = new session.BrowserWindow({
    x: Math.round(layout.point.x),
    y: Math.round(layout.point.y),
    width: Math.round(layout.size.width),
    height: Math.round(layout.size.height),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    parent: parentWindow,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (submenuKey) {
    session.submenuWindow = menuWindow
    session.submenuKey = submenuKey
  } else {
    session.rootMenuWindow = menuWindow
    if (parentWindow) parentWindow.contextMenuWindow = menuWindow
  }

  // 菜单窗自带 will-navigate 协议处理（openpet-menu://），这里只补齐另外两个出口：
  // window.open 与 webview 挂载都不应该存在于一个纯菜单窗口上。
  menuWindow.webContents.setWindowOpenHandler?.(() => ({ action: 'deny' }))
  menuWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())

  menuWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (!url.startsWith('openpet-menu://')) return
    if (!url.startsWith('openpet-menu://select/')) {
      session.closeAll()
      return
    }

    const rawIndex = decodeURIComponent(url.slice('openpet-menu://select/'.length))
    const itemIndex = Number(rawIndex)
    const item = items[itemIndex]
    if (item?.type === 'submenu' && Array.isArray(item.submenu) && item.submenu.length > 0) {
      const nextSubmenuKey = item.id || `submenu:${itemIndex}`
      if (isLiveWindow(session.submenuWindow) && session.submenuKey === nextSubmenuKey) {
        session.cancelPendingDismiss()
        session.submenuWindow.focus?.()
        return
      }

      session.closeSubmenu()
      session.cancelPendingDismiss()
      const parentMenuBounds = getWindowBounds(menuWindow)
      const contentSize = measurePetContextMenu(item.submenu)
      const { workArea } = session.screenService?.getDisplayMatching?.(parentMenuBounds) || {
        workArea: {
          x: 0,
          y: 0,
          width: parentMenuBounds.x + parentMenuBounds.width + contentSize.width + 64,
          height: Math.max(parentMenuBounds.y + parentMenuBounds.height, contentSize.height) + 64
        }
      }
      const size = constrainPetContextMenuSize({ contentSize, workArea })
      const petBounds = getWindowBounds(parentWindow)
      const submenuLayout = layoutPetContextSubmenu({
        parentMenuBounds,
        workArea,
        size,
        petBounds,
        anchorOffsetTop: getMenuItemOffsetTop(items, itemIndex),
        anchorHeight: MENU_METRICS.rowHeight
      })
      const rightCandidate = submenuLayout.candidates.find((candidate) => candidate.placement === 'right')
      const leftCandidate = submenuLayout.candidates.find((candidate) => candidate.placement === 'left')

      session.onSubmenuOpen?.({
        label: item.label || '',
        placement: submenuLayout.placement,
        reason: submenuLayout.reason,
        parentMenuBounds,
        petBounds,
        workArea,
        contentSize,
        scrollable: size.scrollable,
        submenuBounds: {
          x: submenuLayout.point.x,
          y: submenuLayout.point.y,
          width: size.width,
          height: size.height
        },
        parentOverlapArea: submenuLayout.parentOverlapArea,
        petOverlapArea: submenuLayout.petOverlapArea,
        rightCandidate: createSubmenuCandidateDiagnostics(rightCandidate, workArea, size),
        leftCandidate: createSubmenuCandidateDiagnostics(leftCandidate, workArea, size)
      })
      openMenuWindow({
        session,
        items: item.submenu,
        layout: submenuLayout,
        submenuKey: nextSubmenuKey
      })
      return
    }

    session.closeAll()
    if (item) session.onSelect?.(item)
  })
  menuWindow.on('blur', () => session.scheduleDismissIfUnfocused())
  menuWindow.once('closed', () => session.handleWindowClosed(menuWindow))
  menuWindow.once('ready-to-show', () => {
    if (!menuWindow.isDestroyed()) {
      menuWindow.show()
      menuWindow.focus()
    }
  })
  menuWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(createMenuHtml(items, layout.size))}`)

  return menuWindow
}

const showPetContextMenuWindow = ({
  BrowserWindow,
  parentWindow,
  items,
  layout = null,
  point,
  size,
  onSelect,
  onSubmenuOpen = null,
  screenService = electron.screen,
  scheduleTask = setImmediate,
  cancelTask = clearImmediate
}) => {
  parentWindow?.contextMenuSession?.closeAll?.()
  const rootLayout = layout || {
    point,
    size: {
      width: size.width,
      height: size.height,
      contentHeight: size.contentHeight ?? size.height,
      scrollable: Boolean(size.scrollable)
    }
  }
  const session = createMenuSession({
    BrowserWindow,
    hostWindow: parentWindow,
    onSelect,
    onSubmenuOpen,
    screenService,
    scheduleTask,
    cancelTask
  })
  return openMenuWindow({ session, items, layout: rootLayout })
}

module.exports = {
  createMenuHtml,
  showPetContextMenuWindow
}
