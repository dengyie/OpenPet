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
