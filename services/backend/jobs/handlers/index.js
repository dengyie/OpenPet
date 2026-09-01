import * as pluginInstall from "./plugin-install.js"
import * as pluginInstallGithub from "./plugin-install-github.js"
import * as pluginCommand from "./plugin-command.js"
import * as pluginSyncBundled from "./plugin-sync-bundled.js"

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
			finalize: runnerContext.finalize,
			jobId: runnerContext.job.id,
		})
	}]))
}
