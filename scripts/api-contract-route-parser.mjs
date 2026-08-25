const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])

function cells(value) {
	return String(value ?? "").split(/\s*[·,]\s*/).map((item) => item.trim().replace(/^`|`$/g, "")).filter(Boolean)
}

export function expandRouteMethodsAndPaths(methodCell, pathCell) {
	const methods = cells(methodCell).filter((method) => METHODS.has(method))
	const paths = cells(pathCell).filter((path) => path.startsWith("/"))
	if (methods.length === 0 || paths.length === 0) return []
	if (paths.length === 1) return methods.map((method) => [method, paths[0]])
	if (paths.length === 2 && /^\/\{[^/]+\}$/.test(paths[1])) {
		const itemPath = paths[0].replace(/\/$/, "") + paths[1]
		const collection = methods.filter((method) => method === "GET" || method === "POST")
		const item = methods.filter((method) => method === "PATCH" || method === "PUT" || method === "DELETE")
		if (collection.length + item.length !== methods.length || collection.length === 0 || item.length === 0) return []
		return [...collection.map((method) => [method, paths[0]]), ...item.map((method) => [method, itemPath])]
	}
	if (methods.length === paths.length) return methods.map((method, index) => [method, paths[index]])
	return []
}
