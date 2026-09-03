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
	assert.match(release, /run:\s+npm run build:contracts/)
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
		/platform: windows\n\s+runner: windows-latest\n\s+pack_command: npm run build:control-center/,
	)
	assert.doesNotMatch(
		release.slice(windowsStart),
		/^      - name: Build contracts$/m,
		"Windows release job should retain its existing distribution wiring",
	)
})

test("PR test-build builds contracts before every contracts consumer", () => {
	const release = fs.readFileSync(path.join(repoRoot, ".github/workflows/release.yml"), "utf8")
	const testBuildStart = release.indexOf("  test-build:")
	const macosReleaseStart = release.indexOf("  release-macos:")
	assert.ok(testBuildStart >= 0, "release workflow should define the PR test-build job")
	assert.ok(macosReleaseStart > testBuildStart, "PR test-build should precede release jobs")

	const testBuild = release.slice(testBuildStart, macosReleaseStart)
	assert.match(testBuild, /platform: macos\n\s+runner: macos-latest/, "PR test-build should include the macOS matrix entry")
	assert.match(testBuild, /platform: windows\n\s+runner: windows-latest/, "PR test-build should include the Windows matrix entry")
	const lines = testBuild.split(/\r?\n/)
	const indexOfLine = (pattern, message) => {
		const index = lines.findIndex((line) => pattern.test(line))
		assert.notEqual(index, -1, message)
		return index
	}

	const installIndex = indexOfLine(/^        run: npm ci$/, "PR test-build should install dependencies")
	const contractsIndex = indexOfLine(/^      - name: Build contracts$/, "PR test-build should define a contracts build step")
	const testIndex = indexOfLine(/^        run: npm test$/, "PR test-build should run tests")
	const syntaxIndex = indexOfLine(/^        run: npm run check:syntax$/, "PR test-build should check syntax")
	const windowsValidationIndex = indexOfLine(/^      - name: Validate Windows release build inputs$/, "PR test-build should validate Windows inputs")
	const windowsBuildIndex = indexOfLine(/^      - name: Build Control Center on Windows$/, "PR test-build should build Control Center on Windows")
	const packIndex = indexOfLine(/^      - name: Pack unsigned app$/, "PR test-build should pack the app")

	assert.ok(installIndex < contractsIndex, "contracts must build after dependencies are installed")
	assert.ok(contractsIndex < testIndex, "contracts must build before macOS tests")
	assert.ok(contractsIndex < syntaxIndex, "contracts must build before macOS syntax checks")
	assert.ok(contractsIndex < windowsValidationIndex, "contracts must build before Windows build inputs are consumed")
	assert.ok(contractsIndex < windowsBuildIndex, "contracts must build before the Windows Control Center build")
	assert.ok(contractsIndex < packIndex, "contracts must build before packaging")
	assert.equal(
		testBuild.match(/^      - name: Build contracts$/gm)?.length,
		1,
		"PR test-build should have one shared contracts build step",
	)
	assert.doesNotMatch(
		testBuild,
		/^            pack_command: npm run build:contracts/m,
		"Windows packaging should reuse the shared contracts build instead of rebuilding it",
	)
})
