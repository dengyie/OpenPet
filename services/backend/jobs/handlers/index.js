import * as pluginInstall from "./plugin-install.js"
import * as pluginInstallGithub from "./plugin-install-github.js"
import * as pluginCommand from "./plugin-command.js"
import * as pluginSyncBundled from "./plugin-sync-bundled.js"
import * as imageGenerate from "./image-generate.js"

export const PLUGIN_JOB_HANDLERS = Object.freeze([
	pluginInstall,
	pluginInstallGithub,
	pluginCommand,
	pluginSyncBundled,
])

export function createPluginJobHandlers({ db, plugins, logger } = {}) {
	return Object.fromEntries(PLUGIN_JOB_HANDLERS.map((handler) => [handler.kind, async (runnerContext) => {
		return handler.run(runnerContext.job.input ?? {}, {
			db,
			plugins,
			logger,
			progress: runnerContext.report,
			signal: runnerContext.signal,
			tmpDir: runnerContext.tmpDir,
			registerProcess: runnerContext.registerProcess,
			commandInput: plugins?.commandInput ? () => plugins.commandInput(runnerContext.job.id) : undefined,
			finalize: runnerContext.finalize,
		})
	}]))
}

export function createImageJobHandlers({ ai } = {}) {
	return { "image.generate": (runnerContext) => imageGenerate.run(runnerContext.job.input ?? {}, {
		ai,
		signal: runnerContext.signal,
		progress: runnerContext.report,
		tmpDir: runnerContext.tmpDir,
		finalize: runnerContext.finalize,
	}) }
}
