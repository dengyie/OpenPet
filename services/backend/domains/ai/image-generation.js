import fs from "node:fs"
import { randomUUID } from "node:crypto"
import { join, relative, resolve, dirname, sep } from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createImageGenerationModelService } = require("../../../../src/main/services/image-generation-model-service.js")

function settingsAdapter(settings) {
	return {
		get: () => settings.read().values,
		save: (next) => {
			const current = settings.read()
			return settings.patch({ ifVersion: current.version, patch: { "models.imageGeneration": next.models?.imageGeneration ?? {} } })
		},
	}
}

function secretAdapter(secrets) {
	const secretId = (ref) => {
		const value = String(ref || "").trim()
		const imageRef = value.match(/^secret:model\.image\.([^\.]+)\.apiKey$/)
		return imageRef ? imageRef[1] : value.replace(/^secret:/, "")
	}
	return {
		getSecretValue: (ref) => secrets.get(secretId(ref)),
		setSecret: ({ id, value }) => secrets.set(secretId(id || "openai"), value),
		deleteSecret: (ref) => secrets.clear(secretId(ref || "openai")),
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
	const provider = createImageGenerationModelService({
		settingsService: settingsAdapter(settings),
		secretService: secretAdapter(secrets),
		fetchImpl,
		appLogService: { record: (entry) => logger?.info?.(entry.message || "image generation", entry.details) },
	})

	async function prepareGeneratedImage(input, { signal, progress, tmpDir } = {}) {
		if (!tmpDir) throw new Error("Job temporary directory is unavailable")
		progress?.({ phase: "generating", percent: 20 })
		if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
		const output = input?.output
		const prepared = await provider.generateImage({
			...input,
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

	return { ...provider, prepareGeneratedImage, commitGeneratedImage }
}
