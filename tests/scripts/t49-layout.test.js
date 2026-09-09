"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "../..")
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
const exists = (relativePath) => fs.existsSync(path.join(repoRoot, relativePath))

test("desktop and Control Center entrypoints live under their app owners", () => {
  for (const relativePath of [
    "apps/desktop/main.js",
    "apps/desktop/preload.js",
    "apps/desktop/renderer.js",
    "apps/desktop/control-center-preload.js",
    "apps/desktop/index.html",
    "apps/control-center/index.html",
    "apps/control-center/vite.config.js"
  ]) {
    assert.equal(exists(relativePath), true, `missing relocated entrypoint: ${relativePath}`)
  }

  for (const relativePath of [
    "main.js",
    "preload.js",
    "renderer.js",
    "control-center-preload.js",
    "index.html",
    "src/main",
    "src/control-center",
    "src/shared"
  ]) {
    assert.equal(exists(relativePath), false, `legacy entrypoint remains: ${relativePath}`)
  }
})

test("package and Vite contracts point at the relocated applications", () => {
  const packageJson = JSON.parse(read("package.json"))
  const build = packageJson.build
  const vite = read("apps/control-center/vite.config.js")

  assert.equal(packageJson.main, "apps/desktop/main.js")
  assert.match(packageJson.scripts["dev:control-center"], /apps\/control-center\/vite\.config\.js/)
  assert.match(packageJson.scripts["build:control-center"], /apps\/control-center\/vite\.config\.js/)
  assert.match(packageJson.scripts["check:node"], /find apps scripts services tests examples/)
  assert.ok(build.files.includes("apps/desktop/main.js"))
  assert.ok(build.files.includes("apps/desktop/index.html"))
  assert.ok(build.files.includes("apps/**/*"))
  assert.ok(build.files.includes("services/**/*"))
  assert.ok(build.files.includes("packages/**/*"))
  assert.ok(build.files.includes("dist/control-center/**/*"))
  assert.ok(build.asarUnpack.includes("apps/desktop/src/**"))
  assert.doesNotMatch(JSON.stringify(build.files), /src\/main|src\/shared/)
  assert.doesNotMatch(JSON.stringify(build.asarUnpack), /src\/main|src\/shared/)
  assert.match(vite, /root:\s*__dirname/)
  assert.match(vite, /outDir:\s*path\.resolve\(__dirname, '\.\.\/\.\.\/dist\/control-center'\)/)
})

test("protected migration and legacy animation material remain unchanged from T47", () => {
  const baseline = "5c33dbbcb97de6379d69f8d14636600ec82f039e"
  const result = spawnSync("git", ["diff", "--quiet", baseline, "--", "services/backend/store/migrations/001_init.sql", "cat_anime"], {
    cwd: repoRoot,
    encoding: "utf8"
  })

  assert.equal(result.error, undefined, result.error?.message)
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
})
