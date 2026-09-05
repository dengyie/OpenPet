export const kind = "image.generate"

export async function run(input, { ai, signal, progress, tmpDir, finalize } = {}) {
	progress?.({ phase: "preparing", percent: 5 })
	if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
	const prepared = await ai.prepareGeneratedImage(input, { signal, progress, tmpDir })
	if (signal?.aborted) throw signal.reason ?? new Error("Job canceled")
	return finalize(() => ai.commitGeneratedImage(prepared))
}
