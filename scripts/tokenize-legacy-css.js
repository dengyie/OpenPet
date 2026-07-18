#!/usr/bin/env node
/**
 * 一次性迁移脚本：把 styles.css 旧兼容层中的硬编码颜色值机械替换为设计令牌。
 * 只做纯值替换（hex -> var(--op-*)），不动选择器、不改几何、不增删规则。
 * 映射表人工核对，语义优先；未映射的值原样保留并打印告警。
 */
const fs = require('fs')
const path = require('path')

const FILE = path.resolve(__dirname, '../src/control-center/src/styles.css')

// 语义映射：先精确匹配（小写）。颜色尽量归并到既有令牌，减少视觉漂移。
const MAP = {
  // 文本
  '#202124': '--op-color-text',
  '#1f2937': '--op-color-text',
  '#111827': '--op-color-text-strong',
  '#0f172a': '--op-color-text-strong',
  '#374151': '--op-color-text',
  '#334155': '--op-color-text',
  '#4b5563': '--op-color-text-muted',
  '#6b7280': '--op-color-text-muted',
  '#64748b': '--op-color-text-subtle',
  '#475569': '--op-color-text-faint',
  '#3f4652': '--op-color-text-faint',
  '#596270': '--op-color-text-faint',
  '#5f6875': '--op-color-text-faint',
  '#7b8490': '--op-color-text-subtle',
  '#7a8599': '--op-color-text-subtle',
  '#77839a': '--op-color-text-subtle',
  '#929bad': '--op-color-text-subtle',
  // 表面
  '#ffffff': '--op-color-surface',
  '#fff': '--op-color-surface',
  '#f4f6f8': '--op-color-bg',
  '#f8fafc': '--op-color-surface-sunken',
  '#f7fafc': '--op-color-surface-sunken',
  '#f7f9fb': '--op-color-surface-sunken',
  '#fafbfc': '--op-color-surface-sunken',
  '#fbfcfe': '--op-color-surface-sunken',
  '#fbfcff': '--op-color-surface-raised',
  '#fcfdff': '--op-color-surface-raised',
  '#fbfdff': '--op-color-surface-raised',
  '#f8fbff': '--op-color-surface-raised',
  '#f8fbfd': '--op-color-surface-raised',
  '#f1f6f9': '--op-color-surface-sunken',
  '#f1f5f9': '--op-color-surface-sunken',
  '#f0f3f6': '--op-color-surface-sunken',
  '#eef2f6': '--op-color-surface-sunken',
  '#eef2f7': '--op-color-info-soft',
  '#edf1f5': '--op-color-surface-sunken',
  // 边框
  '#dde2e8': '--op-color-border',
  '#cfd6df': '--op-color-border-strong',
  '#e8edf5': '--op-color-border-soft',
  '#e5e7eb': '--op-color-border',
  '#dbe4ef': '--op-color-border',
  '#d7dee8': '--op-color-border',
  '#cbd5e1': '--op-color-border-strong',
  '#e2e7ec': '--op-color-border',
  '#dde5ee': '--op-color-border',
  '#dce5ed': '--op-color-border',
  '#dbe6f2': '--op-color-border',
  '#d8e0ea': '--op-color-border',
  '#d4e2ec': '--op-color-border',
  // 强调
  '#6f5cff': '--op-color-accent',
  '#8973ff': '--op-color-accent',
  '#9b88ff': '--op-color-accent',
  '#f6f2ff': '--op-color-accent-soft',
  // 语义：危险
  '#b91c1c': '--op-color-danger',
  '#d14343': '--op-color-danger',
  '#dc2626': '--op-color-danger',
  '#a83838': '--op-color-danger',
  '#991b1b': '--op-color-danger-hover',
  '#fef2f2': '--op-color-danger-soft',
  '#fff5f5': '--op-color-danger-soft',
  '#fffafa': '--op-color-danger-soft',
  '#fdecec': '--op-color-danger-soft',
  '#fecaca': '--op-color-danger-border',
  '#efb7b7': '--op-color-danger-border',
  // 语义：成功
  '#166534': '--op-color-success',
  '#16a34a': '--op-color-success',
  '#15803d': '--op-color-success',
  '#257044': '--op-color-success',
  '#14532d': '--op-color-success',
  '#f0fdf4': '--op-color-success-soft',
  '#eaf6ef': '--op-color-success-soft',
  '#bbf7d0': '--op-color-success-border',
  '#dcfce7': '--op-color-success-border',
  // 语义：警告
  '#92400e': '--op-color-warning',
  '#d97706': '--op-color-warning',
  '#a16207': '--op-color-warning',
  '#96620d': '--op-color-warning',
  '#8a5a10': '--op-color-warning',
  '#2f2118': '--op-color-warning',
  '#fffdf8': '--op-color-warning-soft',
  '#fffbf2': '--op-color-warning-soft',
  '#fffbeb': '--op-color-warning-soft',
  '#fffaf2': '--op-color-warning-soft',
  '#fffaf0': '--op-color-warning-soft',
  '#fff8ef': '--op-color-warning-soft',
  '#fff8db': '--op-color-warning-soft',
  '#fff7e8': '--op-color-warning-soft',
  '#fff3d9': '--op-color-warning-soft',
  '#f8efe2': '--op-color-warning-soft',
  '#fef3c7': '--op-color-warning-border',
  '#fde68a': '--op-color-warning-border',
  '#f2d6a2': '--op-color-warning-border',
  '#f0d7a5': '--op-color-warning-border',
  // 信息/链接
  '#2563eb': '--op-color-accent-text',
  '#1d4ed8': '--op-color-accent-text',
  '#075985': '--op-color-text-subtle',
  '#e0f2fe': '--op-color-info-soft',
  '#eef6ff': '--op-color-info-soft',
  '#e8edf6': '--op-color-info-soft'
}

let src = fs.readFileSync(FILE, 'utf8')
const unmatched = new Set()

const out = src.replace(/#[0-9a-fA-F]{3,8}\b/g, (raw) => {
  const key = raw.toLowerCase()
  if (MAP[key]) return `var(${MAP[key]})`
  unmatched.add(raw)
  return raw
})

fs.writeFileSync(FILE, out)

const replaced = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length - (out.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length
console.log(`Replaced ${replaced} color values with tokens.`)
if (unmatched.size) {
  console.log('Unmapped (left as-is):')
  for (const c of unmatched) console.log(`  ${c}`)
}
