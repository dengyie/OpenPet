import { finalizing, operationContext, pluginResourceKey, report, requirePluginMethod } from "./common.js"

export const kind = "plugin.install.github"

export function resourceKey(input) {
	return pluginResourceKey(input)
}

export async function run(input = {}, ctx = {}) {
	report(ctx, { phase: "downloading", percent: 10 })
	if (typeof ctx.plugins?.inspectGithub !== "function" || typeof ctx.plugins?.commitGithubInstall !== "function") {
		const installGithub = requirePluginMethod(ctx.plugins, "installGithub")
		return finalizing(ctx, () => installGithub(input.repositoryUrl, operationContext(ctx)))
	}
	const review = await ctx.plugins.inspectGithub(input.repositoryUrl, operationContext(ctx))
	try {
		return await finalizing(ctx, () => ctx.plugins.commitGithubInstall(review.selectionId))
	} finally {
		ctx.plugins.clearInstallSelection?.(review.selectionId)
	}
}
