import { ApiError } from "../../http/middleware.js"

function inputFor(creator, job) {
	// Creator inputs are deliberately kept in the process-local map.  The
	// persisted Job projection is redacted and must never be treated as a
	// restart-safe command payload: reference tokens expire and the workflow
	// payload may contain provider prompts or other private material.
	const input = creator?.getJobInput?.(job.id, null)
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new ApiError("BACKEND_UNAVAILABLE", "Creator Job input is unavailable after restart", {
			details: { jobId: job.id, kind: job.kind },
		})
	}
	return input
}

function context(runnerContext, creator) {
	return {
		signal: runnerContext.signal,
		report: runnerContext.report,
		finalize: runnerContext.finalize,
		creator,
	}
}

export const CHARACTER_KIND = "creator.character"
export const WORKFLOW_KIND = "creator.workflow"
export const EXPORT_KIND = "creator.export"
export const SPRITE_GENERATE_KIND = "sprite.generate"
export const SPRITE_EVALUATE_KIND = "sprite.evaluate"

export function createCreatorJobHandlers({ creator } = {}) {
	if (!creator) throw new TypeError("Creator domain is required")
	return {
		[CHARACTER_KIND]: async (runnerContext) => creator.runCharacter(inputFor(creator, runnerContext.job), context(runnerContext, creator)),
		[WORKFLOW_KIND]: async (runnerContext) => creator.runWorkflow(inputFor(creator, runnerContext.job), context(runnerContext, creator)),
		[EXPORT_KIND]: async (runnerContext) => creator.runExport(inputFor(creator, runnerContext.job), context(runnerContext, creator)),
		[SPRITE_GENERATE_KIND]: async (runnerContext) => creator.runAction(inputFor(creator, runnerContext.job), context(runnerContext, creator)),
		[SPRITE_EVALUATE_KIND]: async (runnerContext) => creator.runWorkflow(inputFor(creator, runnerContext.job), context(runnerContext, creator)),
	}
}
