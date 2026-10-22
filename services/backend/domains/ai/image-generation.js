import fs from "node:fs"
import { createHash, randomUUID } from "node:crypto"
import { extname, join, relative, resolve, dirname, sep } from "node:path"
import { createRequire } from "node:module"
import { ApiError } from "../../http/middleware.js"

const require = createRequire(import.meta.url)
const { createImageGenerationModelService } = require("../../../../apps/desktop/src/services/image-generation-model-service.js")

const WEB_IMAGE_ROOT = "creator-web"
const WEB_IMAGE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
const MAX_WEB_REFERENCE_BYTES = 1_100_000
const MAX_WEB_PREVIEW_BYTES = 4 * 1024 * 1024
const WEB_JOB_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,160}$/
const WEB_IMAGE_OUTPUT_PATH = /^creator-web\/runs\/image-generate:[0-9a-f-]{36}\/([A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(?:png|jpe?g|webp))$/i
const WEB_IMAGE_RUN_DIRECTORY = /^image-generate:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const WEB_REFERENCE_MIME = new Map([
	["image/png", { extension: "png", signature: (bytes) => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
	["image/jpeg", { extension: "jpg", signature: (bytes) => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
	["image/webp", { extension: "webp", signature: (bytes) => bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP" }],
])

function normalizeWebBase64(value) {
	const encoded = typeof value === "string" ? value.trim() : ""
	if (!encoded || encoded.length > 1_500_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
		throw new ApiError("VALIDATION_FAILED", "Reference image encoding is invalid")
	}
	const bytes = Buffer.from(encoded, "base64")
	if (!bytes.length || bytes.byteLength > MAX_WEB_REFERENCE_BYTES) throw new ApiError("VALIDATION_FAILED", "Reference image is too large")
	return bytes
}

function normalizeWebReference(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("VALIDATION_FAILED", "referenceImage must be an object")
	if (Object.keys(value).some((key) => !["mimeType", "dataBase64", "fileName"].includes(key))) throw new ApiError("VALIDATION_FAILED", "referenceImage contains unsupported fields")
	const mimeType = typeof value.mimeType === "string" ? value.mimeType.trim().toLowerCase() : ""
	const descriptor = WEB_REFERENCE_MIME.get(mimeType)
	if (!descriptor) throw new ApiError("VALIDATION_FAILED", "Reference image type is unsupported")
	const bytes = normalizeWebBase64(value.dataBase64)
	if (!descriptor.signature(bytes)) throw new ApiError("VALIDATION_FAILED", "Reference image bytes do not match mimeType")
	return { mimeType, extension: descriptor.extension, bytes }
}

function safeWebJobId(value) {
	const normalized = String(value || "").trim()
	if (!WEB_JOB_ID.test(normalized)) throw new ApiError("VALIDATION_FAILED", "Image Job id is invalid")
	return normalized
}

function safeWebRelativePath(value) {
	const normalized = typeof value === "string" ? value.trim().replaceAll("\\", "/") : ""
	if (!normalized || normalized.startsWith("/") || normalized.includes("\0") || normalized.split("/").includes("..") || !normalized.startsWith(`${WEB_IMAGE_ROOT}/`)) {
		throw new ApiError("VALIDATION_FAILED", "Image preview path is invalid")
	}
	return normalized
}

function imageMimeType(filePath) {
	const extension = extname(filePath).toLowerCase()
	return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" })[extension] || ""
}

function resolveWebImageRoot(userDataDir) {
	const rootPath = resolve(userDataDir)
	if (!fs.existsSync(rootPath)) throw new ApiError("NOT_FOUND", "Generated image not found")
	const root = fs.realpathSync.native(rootPath)
	const webRoot = resolve(root, WEB_IMAGE_ROOT)
	if (!fs.existsSync(webRoot)) throw new ApiError("NOT_FOUND", "Generated image not found")
	if (fs.lstatSync(webRoot).isSymbolicLink() || !fs.statSync(webRoot).isDirectory()) {
		throw new ApiError("PERMISSION_DENIED", "Generated image storage path is invalid")
	}
	assertRealContained(root, webRoot, "Generated image storage path is invalid")
	return fs.realpathSync.native(webRoot)
}

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
	const createWebImageInput = (input = {}, jobId) => {
		if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("VALIDATION_FAILED", "Image generation input is required")
		if (!userDataDir) throw new ApiError("BACKEND_UNAVAILABLE", "Image generation storage is unavailable")
		const id = safeWebJobId(jobId)
		if (input.output !== undefined) throw new ApiError("VALIDATION_FAILED", "Browser image requests cannot provide an output directory")
		if (input.referenceImages !== undefined) throw new ApiError("VALIDATION_FAILED", "Browser image requests cannot provide filesystem references")
		if (Object.keys(input).some((key) => !["prompt", "referenceImage", "candidateCount"].includes(key))) {
			throw new ApiError("VALIDATION_FAILED", "Browser image request contains unsupported fields")
		}
		if (typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 8_000) {
			throw new ApiError("VALIDATION_FAILED", "Image prompt must be a non-empty string of at most 8000 characters")
		}
		const outputCount = input.candidateCount === undefined ? 1 : input.candidateCount
		if (!Number.isInteger(outputCount) || outputCount < 1 || outputCount > 3) {
			throw new ApiError("VALIDATION_FAILED", "candidateCount must be an integer from 1 to 3")
		}
		const referenceImage = input.referenceImage === undefined ? null : normalizeWebReference(input.referenceImage)
		return {
			prompt: input.prompt.trim(),
			textToImage: referenceImage === null,
			outputCount,
			constraints: { width: 1024, height: 1024, transparent: false },
			...(referenceImage ? { referenceImage: {
				mimeType: referenceImage.mimeType,
				dataBase64: input.referenceImage.dataBase64.trim(),
				...(typeof input.referenceImage.fileName === "string" ? { fileName: input.referenceImage.fileName.slice(0, 256) } : {}),
			} } : {}),
			output: {
				dataDir: resolve(String(userDataDir || "")),
				dataRelativeDir: join(WEB_IMAGE_ROOT, "runs", id),
			},
		}
	}

	async function prepareGeneratedImage(input, { signal, progress, tmpDir } = {}) {
		if (!tmpDir) throw new Error("Job temporary directory is unavailable")
		progress?.({ phase: "generating", percent: 20 })
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		const output = input?.output
		let referenceImages = input?.referenceImages
		let referenceDataDir = input?.referenceDataDir || output?.dataDir
		if (input?.referenceImage !== undefined) {
			const reference = normalizeWebReference(input.referenceImage)
			const referenceFileName = `reference.${reference.extension}`
			const referencePath = resolve(tmpDir, referenceFileName)
			assertContained(tmpDir, referencePath, "Reference image path is invalid")
			fs.writeFileSync(referencePath, reference.bytes, { mode: 0o600 })
			referenceImages = [{ path: referencePath, fileName: referenceFileName, relativePath: referenceFileName }]
			referenceDataDir = tmpDir
		}
		const prepared = await provider.generateImage({
			...input,
			...(referenceImages === undefined ? {} : { referenceImages }),
			signal,
			referenceDataDir,
			output: { ...output, dataDir: tmpDir, dataRelativeDir: "outputs" },
		})
		progress?.({ phase: "generated", percent: 90 })
		return { result: prepared, tmpDir, destination: output }
	}

	function previewGeneratedImage(relativePath) {
		if (!userDataDir) throw new ApiError("BACKEND_UNAVAILABLE", "Image preview storage is unavailable")
		const normalized = safeWebRelativePath(relativePath)
		const root = fs.realpathSync.native(resolve(userDataDir))
		const webRoot = resolveWebImageRoot(userDataDir)
		const candidate = resolve(root, normalized)
		assertRealContained(webRoot, candidate, "Image preview path is invalid")
		if (!fs.existsSync(candidate) || fs.lstatSync(candidate).isSymbolicLink() || !fs.statSync(candidate).isFile()) throw new ApiError("NOT_FOUND", "Generated image not found")
		const mimeType = imageMimeType(candidate)
		if (!mimeType) throw new ApiError("VALIDATION_FAILED", "Generated image type is unsupported")
		const bytes = fs.readFileSync(candidate)
		if (bytes.byteLength > MAX_WEB_PREVIEW_BYTES) throw new ApiError("CONFLICT", "Generated image is too large to preview")
		return {
			relativePath: normalized,
			mimeType,
			previewDataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
		}
	}

	function readWebGeneratedReference(relativePath, expectedSha256) {
		if (!userDataDir) throw new ApiError("BACKEND_UNAVAILABLE", "Image preview storage is unavailable")
		const normalized = safeWebRelativePath(relativePath)
		const match = normalized.match(WEB_IMAGE_OUTPUT_PATH)
		if (!match || !/^[a-f0-9]{64}$/i.test(String(expectedSha256 || ""))) {
			throw new ApiError("VALIDATION_FAILED", "Generated image reference is invalid")
		}
		const root = fs.realpathSync.native(resolve(userDataDir))
		const webRoot = resolveWebImageRoot(userDataDir)
		const candidate = resolve(root, normalized)
		assertRealContained(webRoot, candidate, "Generated image reference path is invalid")
		if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile() || fs.lstatSync(candidate).isSymbolicLink()) {
			throw new ApiError("NOT_FOUND", "Generated image not found")
		}
		const mimeType = imageMimeType(candidate)
		const descriptor = WEB_REFERENCE_MIME.get(mimeType)
		const bytes = fs.readFileSync(candidate)
		if (!descriptor || bytes.byteLength > MAX_WEB_PREVIEW_BYTES || !descriptor.signature(bytes)) {
			throw new ApiError("VALIDATION_FAILED", "Generated image reference is unsupported")
		}
		const sha256 = createHash("sha256").update(bytes).digest("hex")
		if (sha256 !== String(expectedSha256).toLowerCase()) throw new ApiError("CONFLICT", "Generated image changed after preview")
		return { relativePath: normalized, mimeType, extension: descriptor.extension, fileName: match[1], sha256, bytes }
	}

	function cleanupExpiredWebImageCandidates({ retainedContentHashes = [], now = Date.now() } = {}) {
		const result = { removedFiles: 0, removedDirectories: 0 }
		if (!userDataDir || !fs.existsSync(resolve(userDataDir))) return result

		let webRoot
		try {
			webRoot = resolveWebImageRoot(userDataDir)
		} catch (error) {
			if (error?.code === "NOT_FOUND") return result
			throw error
		}
		const runsDir = resolve(webRoot, "runs")
		if (!fs.existsSync(runsDir)) return result
		if (fs.lstatSync(runsDir).isSymbolicLink() || !fs.statSync(runsDir).isDirectory()) {
			throw new ApiError("PERMISSION_DENIED", "Generated image runs directory is invalid")
		}
		assertRealContained(webRoot, runsDir, "Generated image runs directory is invalid")

		const retainedHashes = new Set(Array.from(retainedContentHashes || [], (value) => String(value || "").toLowerCase()).filter((value) => /^[a-f0-9]{64}$/.test(value)))
		for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
			if (!WEB_IMAGE_RUN_DIRECTORY.test(entry.name) || !entry.isDirectory()) continue
			const candidateDir = resolve(runsDir, entry.name)
			const candidateStat = fs.lstatSync(candidateDir)
			if (candidateStat.isSymbolicLink() || !candidateStat.isDirectory()) continue
			assertRealContained(runsDir, candidateDir, "Generated image candidate directory is invalid")
			if (now - candidateStat.mtimeMs < WEB_IMAGE_RETENTION_MS) continue

			for (const file of fs.readdirSync(candidateDir, { withFileTypes: true })) {
				if (!file.isFile()) continue
				const candidatePath = resolve(candidateDir, file.name)
				const relativePath = `${WEB_IMAGE_ROOT}/runs/${entry.name}/${file.name}`
				if (!WEB_IMAGE_OUTPUT_PATH.test(relativePath)) continue
				const fileStat = fs.lstatSync(candidatePath)
				if (fileStat.isSymbolicLink() || !fileStat.isFile()) continue
				assertRealContained(candidateDir, candidatePath, "Generated image candidate file is invalid")
				const contentHash = createHash("sha256").update(fs.readFileSync(candidatePath)).digest("hex")
				if (retainedHashes.has(contentHash)) continue
				fs.unlinkSync(candidatePath)
				result.removedFiles += 1
			}

			try {
				fs.rmdirSync(candidateDir)
				result.removedDirectories += 1
			} catch (error) {
				if (error?.code !== "ENOTEMPTY" && error?.code !== "EEXIST") throw error
			}
		}
		return result
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
			const stagingParent = dirname(stageDir)
			fs.mkdirSync(stagingParent, { recursive: true })
			assertRealContained(targetRoot, stagingParent, "Image generation output path is invalid")
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
		if (!String(relativeDir).startsWith(`${WEB_IMAGE_ROOT}/`)) return prepared.result
		const result = structuredClone(prepared.result)
		result.outputs = (Array.isArray(result.outputs) ? result.outputs : []).map((output) => {
			const relativeOutput = String(output.dataRelativePath || "").replaceAll("\\", "/")
			const name = relativeOutput.startsWith("outputs/") ? relativeOutput.slice("outputs/".length) : relativeOutput
			return { ...output, dataRelativePath: join(relativeDir, name).replaceAll("\\", "/") }
		})
		return result
	}

	return { ...provider, getConfig, saveConfig, saveProviderApiKey, clearProviderApiKey, createWebImageInput, prepareGeneratedImage, commitGeneratedImage, previewGeneratedImage, readWebGeneratedReference, cleanupExpiredWebImageCandidates }
}
