import { finalizing, operationContext, pluginResourceKey, report, requirePluginMethod } from "./common.js"

export const kind = "plugin.sync-bundled"

export function resourceKey(input) {
	return pluginResourceKey(input)
}

export async function run(_input = {}, ctx = {}) {
	report(ctx, { phase: "syncing", percent: 25 })
	const syncBundled = requirePluginMethod(ctx.plugins, "syncBundled")
	return finalizing(ctx, () => syncBundled(operationContext(ctx)))
}
