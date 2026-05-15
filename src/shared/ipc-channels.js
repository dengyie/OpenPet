/**
 * IPC 通道名常量 —— 主进程侧的通信契约。
 *
 * 注意：此文件仅被 src/main/ 各模块通过 require 引用。
 * preload 脚本因沙盒 require 限制，需内联定义自己的 IPC 常量副本。
 */
const IPC = {
  PET_GET_ANIMATIONS: 'pet:get-animations',
  PET_GET_BOUNDS: 'pet:get-bounds',
  PET_GET_MOVEMENT_STATE: 'pet:get-movement-state',
  PET_SET_POSITION: 'pet:set-position',
  PET_MOVE_BY: 'pet:move-by',
  PET_QUIT: 'pet:quit',
  SETTINGS_OPEN: 'settings:open',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PREVIEW_SCALE: 'settings:preview-scale',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_CHANGED: 'settings:changed'
}

module.exports = { IPC }
