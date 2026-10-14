import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { join, relative, resolve, dirname, sep } from "node:path"
import { createRequire } from "node:module"
import { ApiError } from "../../http/middleware.js"

const require = createRequire(import.meta.url)
const { createImageGenerationModelService } = require("../../../../apps/desktop/src/services/image-generation-model-service.js")

function settingsAdapter(settings) {
	let pending = Promise.resolve()
	return {
		get: () => settings.read().values,
		save: (next) => {
			const operation = pending.then(() => {
				const current = settings.read()
				return settings.patch({ ifVersion: current.version, patch: { "models.imageGeneration": next.models?.imageGeneration ?? {} } })
			}, () => {
				const current = settings.read()
				return settings.patch({ ifVersion: current.version, patch: { "models.imageGeneration": next.models?.imageGeneration ?? {} } })
			})
			const mapped = operation.catch((cause) => {
				if (cause instanceof ApiError) throw cause
				throw new ApiError("BACKEND_UNAVAILABLE", "Shell image configuration persistence unavailable", { cause })
			})
			pending = mapped.catch(() => undefined)
			return mapped
		},
	}
}

function secretAdapter(secrets) {
	const secretId = (ref) => {
		const value = String(ref || "").trim()
		const imageRef = value.match(/^secret:model\.image\.([^\.]+)\.apiKey$/)
		return imageRef ? imageRef[1] : value.replace(/^secret:/, "")
	}
	let pending = Promise.resolve()
	return {
		getSecretValue: (ref) => secrets.get(secretId(ref)),
		setSecret: ({ id, value }) => {
			const operation = pending.then(() => secrets.set(secretId(id || "openai"), value), () => secrets.set(secretId(id || "openai"), value))
			const mapped = operation.catch((cause) => {
				if (cause instanceof ApiError) throw cause
				throw new ApiError("BACKEND_UNAVAILABLE", "Shell image key persistence unavailable", { cause })
			})
			pending = mapped.catch(() => undefined)
			return mapped
		},
		deleteSecret: (ref) => {
			const operation = pending.then(() => secrets.clear(secretId(ref || "openai")), () => secrets.clear(secretId(ref || "openai")))
			const mapped = operation.catch((cause) => {
				if (cause instanceof ApiError) throw cause
				throw new ApiError("BACKEND_UNAVAILABLE", "Shell image key persistence unavailable", { cause })
			})
			pending = mapped.catch(() => undefined)
			return mapped
		},
	}
}

function assertContained(root, candidate, message) {
	const rootPath = resolve(root)
	const candidatePath = resolve(candidate)
	const within = candidatePath === rootPath || relative(rootPath, candidatePath).split(sep)[0] !== ".."
	if (!within || candidatePath.startsWith(`${rootPath}${sep}`) === false && candidatePath !== rootPath) throw new Error(message)
}

function realPathIfPresent(candidate) {
	try { return fs.realpathSync.native(candidate) } catch (error) {
		if (error?.code !== "ENOENT") throw error
		return null
	}
}

function assertRealContained(root, candidate, message) {
	assertContained(root, candidate, message)
	const realRoot = fs.realpathSync.native(root)
	let current = resolve(candidate)
	while (!fs.existsSync(current)) {
		const parent = dirname(current)
		if (parent === current) break
		current = parent
	}
	const realExisting = realPathIfPresent(current)
	if (!realExisting) throw new Error(message)
	if (relative(realRoot, realExisting).split(sep)[0] === ".." || realExisting !== realRoot && !realExisting.startsWith(`${realRoot}${sep}`)) throw new Error(message)
	return realExisting
}

export function createAiService({ settings, secrets, fetchImpl, logger, userDataDir } = {}) {
	if (!settings?.read || !settings?.patch) throw new TypeError("AI domain requires settings")
	if (!secrets?.get) throw new TypeError("AI domain requires secrets")
	const settingsBridge = settingsAdapter(settings)
	const secretsBridge = secretAdapter(secrets)
	const provider = createImageGenerationModelService({
		settingsService: settingsBridge,
		secretService: secretsBridge,
		fetchImpl,
		awaitPersistence: true,
		appLogService: { record: (entry) => logger?.info?.(entry.message || "image generation", entry.details) },
	})
	let configMutations = Promise.resolve()
	let keyMutations = Promise.resolve()
	const serialize = (queue, operation) => {
		const result = queue.then(operation, operation)
		return { result, queue: result.catch(() => undefined) }
	}

	const imageConfigView = (value = {}) => {
		const config = value && typeof value === "object" && !Array.isArray(value) ? value : {}
		const catalog = config.modelCatalog && typeof config.modelCatalog === "object" && !Array.isArray(config.modelCatalog)
			? config.modelCatalog
			: {}
		return {
			provider: typeof config.provider === "string" ? config.provider : "",
			baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : "",
			model: typeof config.model === "string" ? config.model : "",
			apiKeyRef: typeof config.apiKeyRef === "string" ? config.apiKeyRef : "",
			organization: typeof config.organization === "string" ? config.organization : "",
			project: typeof config.project === "string" ? config.project : "",
			timeoutMs: Number.isInteger(config.timeoutMs) ? config.timeoutMs : 0,
			maxConcurrentJobs: Number.isInteger(config.maxConcurrentJobs) ? config.maxConcurrentJobs : 0,
			hasApiKey: Boolean(config.hasApiKey),
			apiKeyPreview: typeof config.apiKeyPreview === "string" ? config.apiKeyPreview : "",
			apiKeyLabel: typeof config.apiKeyLabel === "string" && config.apiKeyLabel ? config.apiKeyLabel : "Image API Key",
			modelCatalog: {
				cacheKey: typeof catalog.cacheKey === "string" ? catalog.cacheKey : "",
				models: Array.isArray(catalog.models) ? catalog.models.filter((model) => typeof model === "string") : [],
				fetchedAt: typeof catalog.fetchedAt === "string" ? catalog.fetchedAt : "",
				source: ["none", "saved"].includes(catalog.source) ? catalog.source : "none"
			}
		}
	}

	const getConfig = () => imageConfigView(provider.getConfig())
	const saveConfig = (partial) => {
		const operation = serialize(configMutations, async () => {
			try {
				const saved = await provider.saveConfig(partial)
				return imageConfigView(saved)
			} catch (error) {
				if (error instanceof ApiError) throw error
				throw new ApiError("VALIDATION_FAILED", error?.message || "Image config is invalid", { cause: error })
			}
		})
		configMutations = operation.queue
		return operation.result
	}
	const saveProviderApiKey = (value) => {
		const operation = serialize(keyMutations, async () => {
			try {
				return await provider.saveProviderApiKey(value)
			} catch (error) {
				if (error instanceof ApiError) throw error
				throw new ApiError("VALIDATION_FAILED", error?.message || "Image API key is invalid", { cause: error })
			}
		})
		keyMutations = operation.queue
		return operation.result
	}
	const clearProviderApiKey = () => {
		const operation = serialize(keyMutations, async () => {
			return await provider.clearProviderApiKey()
		})
		keyMutations = operation.queue
		return operation.result
	}

	async function prepareGeneratedImage(input, { signal, progress, tmpDir } = {}) {
		if (!tmpDir) throw new Error("Job temporary directory is unavailable")
		progress?.({ phase: "generating", percent: 20 })
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		const output = input?.output
		const prepared = await provider.generateImage({
			...input,
			signal,
			referenceDataDir: output?.dataDir,
			output: { ...output, dataDir: tmpDir, dataRelativeDir: "outputs" },
		})
		progress?.({ phase: "generated", percent: 90 })
		return { result: prepared, tmpDir, destination: output }
	}

	async function commitGeneratedImage(prepared) {
		const destination = prepared?.destination
		const sourceRoot = resolve(prepared.tmpDir)
		const targetRoot = resolve(String(destination?.dataDir || userDataDir || ""))
		const relativeDir = String(destination?.dataRelativeDir || "").trim()
		if (!relativeDir || !targetRoot) throw new Error("Image generation output must target the allowed data directory")
		const sourceDir = resolve(sourceRoot, "outputs")
		const targetDir = resolve(targetRoot, relativeDir)
		const allowedRoot = userDataDir ? resolve(userDataDir) : targetRoot
		if (!fs.existsSync(allowedRoot)) fs.mkdirSync(allowedRoot, { recursive: true })
		assertRealContained(allowedRoot, targetRoot, "Image generation output path is invalid")
		assertRealContained(targetRoot, targetDir, "Image generation output path is invalid")
		assertRealContained(sourceRoot, sourceDir, "Prepared image artifact is invalid")
		const outputs = prepared.result.outputs ?? []
		const stageDir = `${targetDir}.openpet-staging-${randomUUID()}`
		try {
			fs.mkdirSync(stageDir, { recursive: false })
			assertRealContained(targetRoot, stageDir, "Image generation output path is invalid")
			for (const output of outputs) {
				const relativeOutput = String(output.dataRelativePath || "").replaceAll("\\", "/")
				const name = relativeOutput.startsWith("outputs/") ? relativeOutput.slice("outputs/".length) : relativeOutput
				const source = resolve(sourceDir, name)
				const staged = resolve(stageDir, name)
				if (!name || !fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("Prepared image artifact is invalid")
				assertContained(sourceDir, source, "Prepared image artifact is invalid")
				assertContained(stageDir, staged, "Image generation output path is invalid")
				const realSource = fs.realpathSync.native(source)
				assertRealContained(sourceDir, realSource, "Prepared image artifact is invalid")
				fs.mkdirSync(dirname(staged), { recursive: true })
				fs.copyFileSync(realSource, staged)
			}
			if (fs.existsSync(targetDir)) throw new Error("Image generation output directory already exists")
			fs.renameSync(stageDir, targetDir)
		} catch (error) {
			try { fs.rmSync(stageDir, { recursive: true, force: true }) } catch {}
			throw error
		}
		return prepared.result
	}

	return { ...provider, getConfig, saveConfig, saveProviderApiKey, clearProviderApiKey, prepareGeneratedImage, commitGeneratedImage }
}
