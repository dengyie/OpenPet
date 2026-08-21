export function createAboutService({ pkg = {}, runtime = {}, now = Date.now } = {}) {
	const info = () => ({ name: pkg.name ?? "openpet", productName: pkg.build?.productName ?? "OpenPet", version: pkg.version ?? "0.0.0", runtime: runtime.status ?? "ok" })
	const checkUpdates = async () => ({ status: "unavailable", checkedAt: new Date(now()).toISOString(), currentVersion: info().version, latestVersion: "", updateAvailable: false })
	return { info, checkUpdates }
}
