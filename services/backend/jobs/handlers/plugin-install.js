import { finalizing, operationContext, pluginResourceKey, report, requirePluginMethod } from "./common.js"

export const kind = "plugin.install"

export function resourceKey(input) {
	return pluginResourceKey(input)
}

export async function run(input = {}, ctx = {}) {
	report(ctx, { phase: "installing", percent: 25 })
	if (input.selectionId) {
		const commit = typeof ctx.plugins?.commitInstall === "function"
			? ctx.plugins.commitInstall.bind(ctx.plugins)
			: requirePluginMethod(ctx.plugins, "install")
		return finalizing(ctx, () => ctx.plugins?.commitInstall
			? commit(input.selectionId)
			: commit({ selectionId: input.selectionId }))
	}
	if (typeof ctx.plugins?.inspectInstall !== "function" || typeof ctx.plugins?.commitInstall !== "function") {
		const install = requirePluginMethod(ctx.plugins, "install")
		return finalizing(ctx, () => install(input.path, operationContext(ctx)))
	}
	const review = await ctx.plugins.inspectInstall(input.path, operationContext(ctx))
	try {
		return await finalizing(ctx, () => ctx.plugins.commitInstall(review.selectionId))
	} finally {
		ctx.plugins.clearInstallSelection?.(review.selectionId)
	}
}
