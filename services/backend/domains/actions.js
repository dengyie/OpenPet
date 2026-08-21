import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { EVENT_ACTIONS_CHANGED } from "@openpet/contracts"
import { ApiError } from "../http/middleware.js"

const require = createRequire(import.meta.url)
const { inspectFrameFolder } = require("../../../src/main/services/sprite-generator.js")
const { createActionImportService } = require("../../../src/main/services/action-import-service.js")
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

function id(value) {
	if (typeof value !== "string" || !SAFE_ID.test(value)) throw new ApiError("VALIDATION_FAILED", "Action id is invalid")
	return value
}

function readJson(file) {
	try { return JSON.parse(fs.readFileSync(file, "utf8")) } catch (_) { return { defaultAction: "", clickAction: "", actions: [], triggerProposalInbox: [], triggerRules: [] } }
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function sourcePath(value) {
	if (typeof value !== "string" || !path.isAbsolute(value)) throw new ApiError("VALIDATION_FAILED", "Frame folder path must be absolute")
	let real
	try { real = fs.realpathSync(value) } catch (_) { throw new ApiError("VALIDATION_FAILED", "Frame folder does not exist") }
	try { if (fs.lstatSync(value).isSymbolicLink()) throw new ApiError("VALIDATION_FAILED", "Frame folder must not be a symbolic link") } catch (error) {
		if (error instanceof ApiError) throw error
		throw new ApiError("VALIDATION_FAILED", "Frame folder does not exist")
	}
	if (!fs.statSync(real).isDirectory()) throw new ApiError("VALIDATION_FAILED", "Frame folder must be a directory")
	return real
}

export function createActionService({ root, db, jobs, dialog, logger, now = Date.now, emit } = {}) {
	if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("action root must be absolute")
	const configPath = path.join(root, "cat_anime", "animations.json")
	const legacyImporter = createActionImportService({
		framesRoot: path.join(root, "cat_anime", "flames"),
		spritesDir: path.join(root, "cat_anime", "sprites"),
		configPath,
	})
	const proposals = []
	let selection = null

	const config = () => readJson(configPath)
	const save = (next) => {
		fs.mkdirSync(path.dirname(configPath), { recursive: true })
		fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + "\n", "utf8")
		const result = clone(next)
		emit?.(EVENT_ACTIONS_CHANGED, { at: now(), actions: result.actions ?? [] })
		return result
	}
	const list = () => clone(config().actions ?? [])
	const get = (actionId) => list().find((item) => item.id === id(actionId)) ?? null
	const create = (input = {}) => {
		const actionId = id(input.id)
		const current = config()
		if ((current.actions ?? []).some((item) => item.id === actionId)) throw new ApiError("CONFLICT", "Action already exists", { details: { id: actionId } })
		return save({ ...current, actions: [...(current.actions ?? []), { ...input, id: actionId }] })
	}
	const update = (actionId, patch = {}) => {
		const normalized = id(actionId)
		const current = config()
		if (!(current.actions ?? []).some((item) => item.id === normalized)) throw new ApiError("NOT_FOUND", "Action not found", { details: { id: normalized } })
		return save({ ...current, actions: current.actions.map((item) => item.id === normalized ? { ...item, ...patch, id: normalized } : item) })
	}
	const updateConfig = (patch = {}) => {
		const current = config()
		const next = { ...current, ...patch, actions: Array.isArray(patch.actions) ? patch.actions : current.actions ?? [] }
		return save(next)
	}
	const remove = (actionId) => {
		const normalized = id(actionId)
		const current = config()
		if (!(current.actions ?? []).some((item) => item.id === normalized)) throw new ApiError("NOT_FOUND", "Action not found", { details: { id: normalized } })
		if ((current.actions ?? []).length <= 1) throw new ApiError("CONFLICT", "Cannot delete the last action")
		return save({ ...current, actions: current.actions.filter((item) => item.id !== normalized) })
	}
	const play = (actionId) => {
		const action = get(actionId)
		if (!action) throw new ApiError("NOT_FOUND", "Action not found", { details: { id: actionId } })
		return { action }
	}
	const inspect = async (folder) => {
		const real = sourcePath(folder)
		const result = await inspectFrameFolder(real)
		if (!result.valid) throw new ApiError("ACTION_FRAMES_MISSING", result.errors.join("; ") || "No valid action frames", { status: 400, details: { path: real, inspection: result } })
		return { path: real, folderName: path.basename(real), inspection: result }
	}
	const requestFolder = async () => {
		if (!dialog?.request) throw new ApiError("BACKEND_UNAVAILABLE", "dialog service unavailable")
		const response = await dialog.request({ type: "dialog.request", mode: "directory" })
		const paths = response?.body?.paths
		if (paths === null) return null
		if (!Array.isArray(paths) || typeof paths[0] !== "string") throw new ApiError("VALIDATION_FAILED", "dialog returned no frame folder")
		return paths[0]
	}
	const inspectFrames = async (folder) => {
		const selected = folder ?? await requestFolder()
		if (selected === null) return { canceled: true }
		const result = await inspect(selected)
		selection = result
		return result
	}
	const importFrames = async (folder) => {
		const selected = folder ?? selection?.path ?? await requestFolder()
		if (selected === null) return { canceled: true }
		const result = await inspect(selected)
		const actionId = id(path.basename(result.path))
		if (!jobs?.insert) throw new ApiError("BACKEND_UNAVAILABLE", "Job service unavailable")
		const job = jobs.insert({ id: `actions-import-frames:${actionId}:${now()}`, kind: "actions.import-frames", input: { path: result.path, actionId }, resourceKey: `actions:${actionId}` })
		return { jobId: job.id, actionId, inspection: result.inspection }
	}
	const runImportFrames = async ({ path: sourceDir, actionId, signal, report } = {}) => {
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		report?.({ phase: "generating", percent: 25, message: "Generating action sprites" })
		const result = await legacyImporter.importActionFrames({ sourceDir, actionId })
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		emit?.(EVENT_ACTIONS_CHANGED, { at: now(), actions: result.actions ?? [] })
		return result
	}
	const clearSelection = () => { selection = null; return { ok: true } }
	const submitProposal = (input = {}) => { const proposal = { id: input.id ?? `proposal:${now()}`, ...input, status: "pending" }; proposals.push(proposal); return proposal }
	const listProposals = () => clone(proposals)
	return { list, get, create, update, updateConfig, remove, play, submitProposal, listProposals, inspect: inspectFrames, reinspect: inspectFrames, importFrames, runImportFrames, clearSelection, previewProposal: (input) => ({ ...input, preview: true }), acceptProposal: (proposalId) => ({ id: proposalId, status: "accepted" }), rejectProposal: (proposalId) => ({ id: proposalId, status: "rejected" }), updateRule: (ruleId, patch) => ({ id: ruleId, ...patch }), deleteRule: (ruleId) => ({ id: ruleId, deleted: true }), db }
}
