"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "../..")

function readJson(relativePath) {
	return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"))
}

test("contracts build is part of every root packaging entrypoint", () => {
	const scripts = readJson("package.json").scripts
	assert.match(scripts.pack, /npm run build:contracts/)
	assert.match(scripts.dist, /npm run build:contracts/)
})

test("packaged backend keeps contracts and zod in the unpacked ESM boundary", () => {
	const packageJson = readJson("package.json")
	const build = packageJson.build
	assert.equal(packageJson.dependencies["@openpet/contracts"], "0.0.0")
	assert.match(packageJson.dependencies.zod, /^\^4\./)
	assert.ok(build.files.includes("packages/**/*"))
	assert.ok(build.asarUnpack.includes("services/backend/**"))
	assert.ok(build.asarUnpack.includes("packages/contracts/**"))
	assert.ok(build.asarUnpack.includes("node_modules/@openpet/contracts/**"))
	assert.ok(build.asarUnpack.includes("node_modules/zod/**"))
})

test("CI and release packaging explicitly build contracts", () => {
	const ci = fs.readFileSync(path.join(repoRoot, ".github/workflows/ci.yml"), "utf8")
	const release = fs.readFileSync(path.join(repoRoot, ".github/workflows/release.yml"), "utf8")
	assert.match(ci, /run:\s+npm run build:contracts/)
	assert.match(
		release,
		/^          - platform: windows\n            runner: windows-latest\n            pack_command: npm run build:contracts/m,
	)
})

test("macOS release builds contracts before release dependencies and packaging", () => {
	const release = fs.readFileSync(path.join(repoRoot, ".github/workflows/release.yml"), "utf8")
	const macosStart = release.indexOf("  release-macos:")
	const windowsStart = release.indexOf("  release-windows:")
	assert.ok(macosStart >= 0, "release workflow should define the macOS release job")
	assert.ok(windowsStart > macosStart, "Windows release job should follow the macOS release job")

	const macos = release.slice(macosStart, windowsStart)
	const contractsStep = "      - name: Build contracts\n        run: npm run build:contracts"
	const contractsIndex = macos.indexOf(contractsStep)
	assert.notEqual(contractsIndex, -1, "macOS release should explicitly build contracts")
	assert.equal(
		macos.match(/run: npm run build:contracts/g)?.length,
		1,
		"macOS release should have one explicit contracts build step",
	)
	assert.ok(
		macos.indexOf("      - name: Install dependencies") < contractsIndex,
		"macOS contracts build must happen after dependency installation",
	)
	assert.ok(
		contractsIndex < macos.indexOf("      - name: Install Playwright Chromium"),
		"macOS contracts build must precede release checks",
	)
	assert.ok(
		contractsIndex < macos.indexOf("run: npm run dist -- --publish never"),
		"macOS contracts build must precede distribution packaging",
	)

	const testBuild = release.slice(0, macosStart)
	assert.match(testBuild, /platform: macos\n\s+runner: macos-latest\n\s+pack_command: npm run pack/)
	assert.match(
		testBuild,
		/platform: windows\n\s+runner: windows-latest\n\s+pack_command: npm run build:contracts && npm run build:control-center/,
	)
	assert.doesNotMatch(
		release.slice(windowsStart),
		/^      - name: Build contracts$/m,
		"Windows release job should retain its existing distribution wiring",
	)
})
