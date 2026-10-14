# AI Provider Smoke Evidence

This directory stores archived AI provider smoke sessions for configured provider paths.

Historical passing smoke: `2026-06-28T11-08-10Z-openpet-gateway/`. The configured-key development-gateway run at `2026-10-08T21-20-30Z-deepseek-chat-check/` discovered 182 models and completed a `deepseek-v4-flash` chat request. A later manual run in the unsigned packaged macOS arm64 demo at [`2026-10-08T22-13-25Z-packaged-chat-check/`](./2026-10-08T22-13-25Z-packaged-chat-check/) confirmed saved Provider configuration and one streamed text-chat response. A separate `gpt-5.5` attempt at `2026-10-08T21-19-28Z-gpt55-routing-failure/` received a sanitized 404 from the gateway; keep model selection tied to a model that is currently routable.

The packaged run verifies text-chat wiring only. Image generation was skipped because it may be billable. Evidence records the test credential as configured and contains no key value or preview.

These archives are useful because they preserve specific provider-session results and operator notes. They do not by themselves prove future provider availability, image output quality, or desktop release readiness.
