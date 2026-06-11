/**
 * IPC 通道名常量 —— 主进程侧的通信契约。
 *
 * 注意：此文件仅被 src/main/ 各模块通过 require 引用。
 * preload 脚本因沙盒 require 限制，需内联定义自己的 IPC 常量副本。
 */
const IPC = {
  PET_GET_ANIMATIONS: 'pet:get-animations',
  PET_ANIMATIONS_CHANGED: 'pet:animations-changed',
  PET_GET_BOUNDS: 'pet:get-bounds',
  PET_GET_MOVEMENT_STATE: 'pet:get-movement-state',
  PET_SET_POSITION: 'pet:set-position',
  PET_MOVE_BY: 'pet:move-by',
  PET_SAY: 'pet:say',
  PET_PLAY_ACTION: 'pet:play-action',
  PET_QUIT: 'pet:quit',
  SETTINGS_OPEN: 'settings:open',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_PREVIEW_SCALE: 'settings:preview-scale',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_CHANGED: 'settings:changed',
  ACTIONS_GET: 'actions:get',
  ACTIONS_IMPORT_FRAMES: 'actions:import-frames',
  ACTIONS_SAVE_CONFIG: 'actions:save-config',
  ACTIONS_DELETE: 'actions:delete',
  AI_GET_CONFIG: 'ai:get-config',
  AI_SAVE_CONFIG: 'ai:save-config',
  AI_SAVE_API_KEY: 'ai:save-api-key',
  AI_TEST_CONNECTION: 'ai:test-connection',
  AI_CHAT: 'ai:chat',
  PLUGINS_LIST: 'plugins:list',
  PLUGINS_SET_ENABLED: 'plugins:set-enabled',
  PLUGINS_RUN_COMMAND: 'plugins:run-command',
  SERVICE_GET_STATUS: 'service:get-status',
  SERVICE_SAVE_CONFIG: 'service:save-config'
}

module.exports = { IPC }
