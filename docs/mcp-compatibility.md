# OpenPet MCP Compatibility Matrix

> Last updated: 2026-06-13

| Client | Transport | Auth | Status | Notes |
|--------|-----------|------|--------|-------|
| curl / local scripts | JSON-RPC HTTP | Bearer token + `Mcp-Session-Id` | Verified by automated tests | See `docs/mcp-usage.md` examples |
| Codex / local agents | JSON-RPC HTTP | Bearer token + `Mcp-Session-Id` | Ready for manual validation | Uses standard `initialize`, `tools/list`, `tools/call` |
| OpenAI Agents SDK | HTTP tool bridge | Bearer token + `Mcp-Session-Id` | Pending manual validation | Depends on client MCP transport support |
| Claude Desktop | MCP HTTP / bridge config | Bearer token + `Mcp-Session-Id` | Pending manual validation | Needs local config example once client transport is confirmed |
| Cursor / Windsurf | MCP HTTP | Bearer token + `Mcp-Session-Id` | Pending manual validation | Streamable HTTP compatibility still needs real-client smoke |

## Implemented Server Behaviors

- `POST /mcp` JSON-RPC initialize.
- `POST /mcp` tools/list and tools/call behind token + session.
- `GET /mcp` authenticated `text/event-stream` endpoint handshake.
- Session TTL and max session pruning.
- Token rotation and Service-tab session revocation.
- Tool argument schema validation.
- MCP-specific access log paths such as `/mcp/tools/call/openpet.say`.
- Legacy `ibot.*` tool names are accepted as aliases for OpenPet upgrade compatibility.

## Known Gaps

- Real-client verification is still pending for Claude Desktop, Cursor, Windsurf, and OpenAI Agents SDK.
- The stream endpoint is a minimal handshake, not a long-running bidirectional transport.
- No MCP resources or prompts are exposed yet; current product value is in tools only.
