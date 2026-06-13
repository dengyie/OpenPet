# OpenPet MCP Usage

> Local only. The MCP endpoint is disabled until the Control Center Service tab starts the local HTTP service.

## Enable

1. Open Control Center.
2. Go to Service.
3. Enable HTTP API.
4. Save.
5. Copy the MCP endpoint and token.

The endpoint is:

```text
http://127.0.0.1:<port>/mcp
```

Every request must include one token header:

```text
Authorization: Bearer <token>
```

or:

```text
X-OpenPet-Token: <token>
```

## Initialize

```bash
curl -i http://127.0.0.1:32123/mcp \
  -H "Authorization: Bearer $OPENPET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

Save the returned `Mcp-Session-Id` header. Tool requests must include it.

## List Tools

```bash
curl http://127.0.0.1:32123/mcp \
  -H "Authorization: Bearer $OPENPET_TOKEN" \
  -H "Mcp-Session-Id: $OPENPET_MCP_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

## Call A Tool

```bash
curl http://127.0.0.1:32123/mcp \
  -H "Authorization: Bearer $OPENPET_TOKEN" \
  -H "Mcp-Session-Id: $OPENPET_MCP_SESSION" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"openpet.say","arguments":{"text":"hello from MCP"}}}'
```

## Stream Handshake

Clients that probe streamable HTTP can send:

```bash
curl http://127.0.0.1:32123/mcp \
  -H "Authorization: Bearer $OPENPET_TOKEN" \
  -H "Mcp-Session-Id: $OPENPET_MCP_SESSION"
```

The service responds with a short `text/event-stream` endpoint event.

## Tools

- `openpet.status`: returns the pet snapshot.
- `openpet.say`: shows a speech bubble.
- `openpet.play_action`: plays an action by id.
- `openpet.set_event`: sets a pet event with an optional message.

Legacy `ibot.*` tool names remain accepted for upgrade compatibility, but new integrations should use `openpet.*`.

## Security Notes

- The service binds only to loopback hosts.
- The service is off by default.
- Token rotation revokes every MCP session.
- Service tab can revoke all MCP sessions without rotating the token.
- Access logs do not store token values.
