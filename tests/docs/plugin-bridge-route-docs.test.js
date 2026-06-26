const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  PLUGIN_BRIDGE_ROUTE_INVENTORY,
  PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES
} = require('../../src/main/services/plugin-bridge-handlers-controller')

const DOC_CASES = [
  {
    name: 'plugin-development bridge route inventory docs',
    filePath: path.join(__dirname, '../../docs/plugin-development.md'),
    routeSectionHeadings: ['Current bridge routes:', 'Current endpoint set:'],
    permissionSectionOccurrences: 2
  },
  {
    name: 'plugin-ecosystem-rules bridge route inventory docs',
    filePath: path.join(__dirname, '../../docs/plugin-ecosystem-rules.md'),
    routeSectionHeadings: ['The current local bridge stays intentionally small:'],
    permissionSectionOccurrences: 1
  }
]

const routeLines = PLUGIN_BRIDGE_ROUTE_INVENTORY.map((entry) => `- \`${entry.method} ${entry.path}\``)
const permissionLines = PLUGIN_BRIDGE_ROUTE_PERMISSION_NAMES.map((permission) => `- \`${permission}\``)

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const extractListSections = (content, heading) => {
  const expression = new RegExp(`${escapeRegExp(heading)}\\n\\n((?:- .*\\n)+)`, 'g')
  const matches = []
  let match = expression.exec(content)
  while (match) {
    matches.push(match[1])
    match = expression.exec(content)
  }
  return matches
}

for (const docCase of DOC_CASES) {
  test(docCase.name, () => {
    const content = fs.readFileSync(docCase.filePath, 'utf8')
    const routeSections = docCase.routeSectionHeadings.flatMap((heading) => extractListSections(content, heading))
    const permissionSections = extractListSections(content, 'Current bridge permission set:')

    assert.equal(routeSections.length, docCase.routeSectionHeadings.length)
    assert.equal(permissionSections.length, docCase.permissionSectionOccurrences)

    routeSections.forEach((section) => {
      routeLines.forEach((line) => {
        assert.match(section, new RegExp(escapeRegExp(line)))
      })
    })

    permissionSections.forEach((section) => {
      permissionLines.forEach((line) => {
        assert.match(section, new RegExp(escapeRegExp(line)))
      })
    })
  })
}
