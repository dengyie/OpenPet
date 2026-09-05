import { copyFileSync, mkdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"
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
	return {
		getSecretValue: (ref) => secrets.get(ref) || secrets.get(String(ref).replace(/^secret:/, "")) || secrets.get("openai"),
		setSecret: ({ id, value }) => secrets.set(id || "openai", value),
		deleteSecret: (ref) => secrets.clear(ref || "openai"),
	}
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
		if (relative(allowedRoot, targetRoot).startsWith("..") || relative(sourceRoot, sourceDir).startsWith("..") || relative(targetRoot, targetDir).startsWith("..")) throw new Error("Image generation output path is invalid")
		mkdirSync(targetDir, { recursive: true })
		const outputs = prepared.result.outputs ?? []
		for (const output of outputs) {
			const name = String(output.dataRelativePath || "").split("/").at(-1)
			const source = resolve(sourceDir, name)
			if (!name || relative(sourceDir, source).startsWith("..") || !statSync(source).isFile()) throw new Error("Prepared image artifact is invalid")
			copyFileSync(source, join(targetDir, name))
		}
		return prepared.result
	}

	return { ...provider, prepareGeneratedImage, commitGeneratedImage }
}
