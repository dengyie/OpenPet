# AI Provider Model Routing Variation

- Date: 2026-10-08 UTC
- Target: documented OpenAI-compatible test gateway (`https://api.mangoqwq.com/v1`)
- Model discovery: HTTP 200; 182 models discovered
- Chat completion: HTTP 404 with sanitized message `Application not found` for `gpt-5.5`
- Image generation: not executed
- Claim boundary: this is a failed model-routing attempt retained beside the passing `deepseek-v4-flash` run. It does not indicate credential failure; model routing can vary at the gateway and the configured routable model must be used.

The machine-readable report contains only the provider key preview and sanitized response fields.
