import { statSync } from "node:fs"
import { resolve } from "node:path"

// T43 removes plugin HTTP-parity methods from the renderer bridge.
// M5 may reduce the limit further after the remaining native boundaries migrate.
export const PRELOAD_SIZE_LIMIT = 10 * 1024
const file = resolve(process.cwd(), "apps/desktop/control-center-preload.js")

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
