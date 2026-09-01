import { operationContext, pluginResourceKey, report, requirePluginMethod, throwIfAborted } from "./common.js"

export const kind = "plugin.command"

export function resourceKey(input) {
	return pluginResourceKey(input)
}

export async function run(input = {}, ctx = {}) {
	throwIfAborted(ctx.signal)
	report(ctx, { phase: "running", percent: 10 })
	const command = requirePluginMethod(ctx.plugins, "command")
	const transient = ctx.plugins.commandInput?.(ctx.jobId)
	const pluginId = transient?.pluginId ?? input.pluginId
	const commandId = transient?.command ?? input.command
	const args = transient?.args ?? input.args ?? {}
	const result = await command(pluginId, commandId, args, operationContext(ctx))
	throwIfAborted(ctx.signal)
	return result
}
