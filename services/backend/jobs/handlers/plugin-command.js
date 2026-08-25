import { operationContext, pluginResourceKey, report, requirePluginMethod, throwIfAborted } from "./common.js"

export const kind = "plugin.command"

export function resourceKey(input) {
	return pluginResourceKey(input)
}

export async function run(input = {}, ctx = {}) {
	throwIfAborted(ctx.signal)
	report(ctx, { phase: "running", percent: 10 })
	const command = requirePluginMethod(ctx.plugins, "command")
	const result = await command(input.pluginId, input.command, input.args ?? {}, operationContext(ctx))
	throwIfAborted(ctx.signal)
	return result
}
