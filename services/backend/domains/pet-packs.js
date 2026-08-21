import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"
import { EVENT_PET_PACK_ACTIVATED } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

const require = createRequire(import.meta.url)
const zip = require("../../../src/main/services/zip-archive-utils.js")

export const MAX_PET_PACK_BYTES = 200 * 1024 * 1024
export const PET_PACK_ROUTES = Object.freeze([
	"GET /pet-packs",
	"POST /pet-packs/import",
	"POST /pet-packs/:id/activate",
	"DELETE /pet-packs/:id",
	"POST /pet-packs/:id/export",
	"GET /pet-packs/:id/manifest",
	"POST /pet-packs/validate",
])

const ZIP_MAGIC = new Set(["504b0304", "504b0506", "504b0708"])
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function fail(message, details = null) {
	throw new ApiError("VALIDATION_FAILED", message, { details })
}

function safeId(value) {
	if (typeof value !== "string" || !SAFE_ID.test(value)) fail("Pet pack id is invalid", { id: value ?? null })
	return value
}

function realDirectory(value, field) {
	if (typeof value !== "string" || !path.isAbsolute(value)) fail(`${field} must be an absolute path`)
	try { return fs.realpathSync(value) } catch (error) { fail(`${field} does not exist`, { cause: String(error) }) }
}

function isInside(candidate, parent) {
	return candidate === parent || candidate.startsWith(parent + path.sep)
}

function assertOutsideProtected(candidate, protectedRoots, field) {
	if (protectedRoots.some((root) => isInside(candidate, root))) fail(`${field} is inside a protected application directory`)
}

function assertZipFile(sourcePath, protectedRoots) {
	const real = realDirectory(sourcePath, "source path")
	let stat
	try { stat = fs.statSync(real) } catch (error) { fail("source path is not readable", { cause: String(error) }) }
	if (!stat.isFile()) fail("source path must be a file")
	if (real !== sourcePath) fail("source path must not be a symbolic link")
	if (!/\.zip$/i.test(real)) fail("pet pack source must use a .zip extension")
	if (stat.size > MAX_PET_PACK_BYTES) throw new ApiError("PAYLOAD_TOO_LARGE", "pet pack exceeds the 200 MB limit")
	const magic = Buffer.alloc(4)
	const fd = fs.openSync(real, "r")
	try { fs.readSync(fd, magic, 0, 4, 0) } finally { fs.closeSync(fd) }
	if (!ZIP_MAGIC.has(magic.toString("hex"))) fail("pet pack source is not a ZIP archive")
	assertOutsideProtected(real, protectedRoots, "source path")
	return real
}

async function readManifestFromZip(sourcePath) {
	const extracted = await zip.extractZipToTemp(sourcePath, {
		subject: "Pet pack package",
		folderSubject: "Pet pack",
		limits: { ...zip.DEFAULT_ZIP_LIMITS, maxExpandedBytes: MAX_PET_PACK_BYTES, maxFileBytes: MAX_PET_PACK_BYTES },
	})
	try {
		const candidates = []
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const next = path.join(dir, entry.name)
				if (entry.isDirectory()) walk(next)
				else if (entry.isFile() && entry.name === "pet.json") candidates.push(next)
			}
		}
		walk(extracted)
		if (candidates.length !== 1) fail("pet pack must contain exactly one pet.json")
		let manifest
		try { manifest = JSON.parse(fs.readFileSync(candidates[0], "utf8")) } catch (error) { fail("pet pack manifest is invalid", { cause: String(error) }) }
		const id = safeId(manifest?.id)
		return { id, manifest }
	} finally {
		fs.rmSync(extracted, { recursive: true, force: true })
	}
}

export function createPetPackService({ root, userDataDir, db, jobs, dialog, logger, now = Date.now, emit } = {}) {
	if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("pet pack root must be absolute")
	const appRoot = fs.realpathSync(root)
	const protectedRoots = [appRoot]
	if (typeof userDataDir === "string" && path.isAbsolute(userDataDir)) {
		try { protectedRoots.push(fs.realpathSync(userDataDir)) } catch (_) { protectedRoots.push(path.resolve(userDataDir)) }
	}
	const packsRoot = path.join(typeof userDataDir === "string" ? userDataDir : root, "pet-packs")
	const bundledRoot = path.join(root, "assets", "pet-packs")
	let activePackId = "legacy-cat"

	const packPath = (id) => path.join(packsRoot, safeId(id))
	const list = () => {
		const packs = []
		for (const [dir, source] of [[bundledRoot, "bundled"], [packsRoot, "user-installed"]]) {
			if (!fs.existsSync(dir)) continue
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				if (!entry.isDirectory() || !SAFE_ID.test(entry.name)) continue
				try {
					const manifest = JSON.parse(fs.readFileSync(path.join(dir, entry.name, "pet.json"), "utf8"))
					packs.push({ id: entry.name, displayName: manifest.displayName ?? entry.name, version: manifest.version ?? "1.0.0", source, active: entry.name === activePackId })
				} catch (error) { logger?.warn?.("读取 pet pack 清单失败", { path: path.join(dir, entry.name), error: String(error) }) }
			}
		}
		return { activePackId, packs }
	}
	const get = (id) => {
		const normalized = safeId(id)
		for (const candidate of [path.join(bundledRoot, normalized), path.join(packsRoot, normalized)]) {
			const manifestPath = path.join(candidate, "pet.json")
			if (fs.existsSync(manifestPath)) return JSON.parse(fs.readFileSync(manifestPath, "utf8"))
		}
		throw new ApiError("NOT_FOUND", "Pet pack not found", { details: { id: normalized } })
	}
	const activate = (id) => {
		const manifest = get(id)
		activePackId = safeId(id)
		emit?.(EVENT_PET_PACK_ACTIVATED, { id: activePackId, at: now(), manifest })
		return { activePackId, pack: manifest }
	}
	const remove = (id) => {
		const normalized = safeId(id)
		if (normalized === activePackId) throw new ApiError("CONFLICT", "Cannot remove the active pet pack")
		const target = path.join(packsRoot, normalized)
		if (!fs.existsSync(path.join(target, "pet.json"))) throw new ApiError("NOT_FOUND", "Pet pack not found", { details: { id: normalized } })
		fs.rmSync(target, { recursive: true, force: true })
		return { removed: normalized }
	}
	const inspect = async (sourcePath) => {
		const real = assertZipFile(sourcePath, protectedRoots)
		const result = await readManifestFromZip(real)
		return { ...result, path: real, byteSize: fs.statSync(real).size }
	}
	const requestPath = async (mode) => {
		if (!dialog?.request) throw new ApiError("BACKEND_UNAVAILABLE", "dialog service unavailable")
		const response = await dialog.request({ type: "dialog.request", mode })
		const paths = response?.body?.paths
		if (paths === null) return null
		if (!Array.isArray(paths) || typeof paths[0] !== "string") fail("dialog returned no path")
		return paths[0]
	}
	const importPack = async (sourcePath) => {
		const selected = sourcePath ?? await requestPath("file")
		if (selected === null) return { canceled: true }
		const inspected = await inspect(selected)
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({ id: `pet-pack-import:${inspected.id}:${now()}`, kind: "pet-pack.import", input: { path: inspected.path, id: inspected.id }, resourceKey: `pet-pack:${inspected.id}` })
		return { jobId: job.id, item: inspected }
	}
	const exportPack = async (id, target) => {
		const normalized = safeId(id)
		get(normalized)
		const output = target ?? await requestPath("directory")
		if (output === null) return { canceled: true }
		const directory = realDirectory(output, "export target")
		assertOutsideProtected(directory, protectedRoots, "export target")
		if (!fs.statSync(directory).isDirectory()) fail("export target must be a directory")
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({ id: `pet-pack-export:${normalized}:${now()}`, kind: "pet-pack.export", input: { id: normalized, target: directory }, resourceKey: `pet-pack:${normalized}` })
		return { jobId: job.id }
	}
	const runImport = async ({ path: sourcePath, id, signal, report } = {}) => {
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		const real = assertZipFile(sourcePath, protectedRoots)
		const extracted = await zip.extractZipToTemp(real, {
			subject: "Pet pack package",
			folderSubject: "Pet pack",
			limits: { ...zip.DEFAULT_ZIP_LIMITS, maxExpandedBytes: MAX_PET_PACK_BYTES, maxFileBytes: MAX_PET_PACK_BYTES },
		})
		try {
			let sourceDir = extracted
			const candidates = []
			const walk = (dir) => {
				for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
					const next = path.join(dir, entry.name)
					if (entry.isDirectory()) walk(next)
					else if (entry.isFile() && entry.name === "pet.json") candidates.push(path.dirname(next))
				}
			}
			walk(extracted)
			if (candidates.length !== 1) fail("pet pack must contain exactly one pet.json")
			sourceDir = candidates[0]
			const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "pet.json"), "utf8"))
			const packId = safeId(id ?? manifest.id)
			if (packId !== manifest.id) fail("pet pack id does not match inspected package")
			if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
			report?.({ phase: "writing", percent: 50, message: "Installing pet pack" })
			fs.mkdirSync(packsRoot, { recursive: true })
			const target = packPath(packId)
			fs.rmSync(target, { recursive: true, force: true })
			fs.cpSync(sourceDir, target, { recursive: true, errorOnExist: true })
			return { id: packId, manifest, path: target }
		} finally {
			fs.rmSync(extracted, { recursive: true, force: true })
		}
	}
	const runExport = async ({ id, target, signal, report } = {}) => {
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		const normalized = safeId(id)
		const manifest = get(normalized)
		if (normalized === "legacy-cat") throw new ApiError("VALIDATION_FAILED", "Cannot export the built-in pet pack")
		const source = packPath(normalized)
		fs.mkdirSync(target, { recursive: true })
		report?.({ phase: "writing", percent: 40, message: "Exporting pet pack" })
		const outputPath = path.join(target, `${normalized}-${manifest.version ?? "1.0.0"}.openpet-pet.zip`)
		await zip.writeZipFromDirectory(source, outputPath)
		return { id: normalized, outputPath, byteSize: fs.statSync(outputPath).size }
	}
	return { list, get, activate, remove, inspect, import: importPack, export: exportPack, runImport, runExport, status: () => ({ activePackId, db: db?.driverName ?? null }) }
}
