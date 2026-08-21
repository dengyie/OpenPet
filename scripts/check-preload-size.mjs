import { statSync } from "node:fs"
import { resolve } from "node:path"

// M2 keeps this deliberately loose while the IPC bridge is still present.
// M5 must reduce the limit to 5 KiB after the HTTP cutover removes these methods.
export const PRELOAD_SIZE_LIMIT = 24 * 1024
const file = resolve(process.cwd(), "control-center-preload.js")

try {
	const bytes = statSync(file).size
	if (bytes > PRELOAD_SIZE_LIMIT) {
		console.error(`control-center-preload.js is ${bytes} bytes; limit is ${PRELOAD_SIZE_LIMIT}`)
		process.exitCode = 1
	} else {
		console.log(`control-center-preload.js size ${bytes}/${PRELOAD_SIZE_LIMIT} bytes`)
	}
} catch (error) {
	console.error(`Unable to inspect ${file}: ${error.message}`)
	process.exitCode = 1
}
