// Provider/model selection is owned by the Backend image service. Creator
// payloads may echo the read-only model settings they received from the host,
// so remove those fields before crossing into the mutation boundary.
export function omitImageProviderOwnerFields(payload = {}) {
	if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}
	const { provider: _provider, baseUrl: _baseUrl, apiKeyRef: _apiKeyRef, model: _model, ...request } = payload
	return request
}
