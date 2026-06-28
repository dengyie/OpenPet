const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')
const pluginBridgeServerPath = path.join(repoRoot, 'src', 'main', 'services', 'plugin-command-bridge-server.js')
const pluginDevelopmentDocPath = path.join(repoRoot, 'docs', 'plugin-development.md')
const pluginRulesDocPath = path.join(repoRoot, 'docs', 'plugin-ecosystem-rules.md')

const readText = (filePath) => fs.readFileSync(filePath, 'utf-8')

const extractBridgeRoutesFromService = () => {
  const source = readText(pluginBridgeServerPath)
  const routePatternLine = source.split(/\r?\n/).find((line) => line.startsWith('const ROUTE_PATTERN = '))
  assert.ok(routePatternLine, 'Expected plugin command bridge server route matcher to exist')
  const match = routePatternLine.match(/\((\\\/context\|.*)\)\$\/$/)
  assert.ok(match, 'Expected plugin command bridge server route group to exist')
  return match[1]
    .split('|')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/\\/g, ''))
}

const extractRouteListSection = (documentText, heading, endMarker) => {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedEndMarker = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = documentText.match(new RegExp(`${escapedHeading}[\\s\\S]*?${escapedEndMarker}`, 'm'))
  assert.ok(match, `Expected section "${heading}" to exist`)
  return match[0]
}

const extractListedRoutes = (sectionText) => (
  Array.from(sectionText.matchAll(/- `((?:GET|POST) [^`]+)`/g)).map((match) => match[1].replace(/^(GET|POST)\s+/, ''))
)

test('plugin bridge author docs list the current implemented bridge routes', () => {
  const implementedRoutes = extractBridgeRoutesFromService()
  const pluginDevelopmentDoc = readText(pluginDevelopmentDocPath)
  const pluginRulesDoc = readText(pluginRulesDocPath)

  const developmentCurrentRoutes = extractListedRoutes(
    extractRouteListSection(pluginDevelopmentDoc, 'Current bridge routes:', 'The bridge is loopback-only')
  )
  const developmentEndpointSet = extractListedRoutes(
    extractRouteListSection(pluginDevelopmentDoc, 'Current endpoint set:', 'Bridge rules:')
  )
  const rulesRouteSet = extractListedRoutes(
    extractRouteListSection(pluginRulesDoc, 'The current local bridge stays intentionally small:', 'The bridge is for integration convenience.')
  )

  assert.deepEqual(
    developmentCurrentRoutes,
    implementedRoutes,
    'docs/plugin-development.md "Current bridge routes" must match the implemented bridge surface'
  )
  assert.deepEqual(
    developmentEndpointSet,
    implementedRoutes,
    'docs/plugin-development.md "Current endpoint set" must match the implemented bridge surface'
  )
  assert.deepEqual(
    rulesRouteSet,
    implementedRoutes,
    'docs/plugin-ecosystem-rules.md bridge route list must match the implemented bridge surface'
  )
})

test('plugin bridge author docs describe host-managed generation and unsupported plugin-managed provider credentials', () => {
  const combinedDocs = `${readText(pluginDevelopmentDocPath)}\n${readText(pluginRulesDocPath)}`

  assert.match(
    combinedDocs,
    /generation remains host-managed|host-managed model settings|host-owned image Provider|host-owned generation/i,
    'Expected extension author docs to describe host-managed generation'
  )
  assert.match(
    combinedDocs,
    /plugin-managed provider credentials.*unsupported|unsupported.*plugin-managed provider credentials/i,
    'Expected extension author docs to state that plugin-managed provider credentials are currently unsupported'
  )
})
