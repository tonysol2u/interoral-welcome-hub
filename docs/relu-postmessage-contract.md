# Relu iframe postMessage contract

Source read before rebuilding:

- `src/components/chicago/MagicMirror.tsx`
- `src/lib/relu-iframe-api.ts`
- `supabase/functions/relu-iframe-token/index.ts`
- `supabase/functions/medit-webhook/index.ts`

The current Magic Mirror does not directly import `@relu-bv/iframe-api`; it keeps a local TypeScript bridge aligned to the `@relu-bv/iframe-api` v0.2.0 pattern. The new portal preserves that message shape instead of inventing a new iframe protocol.

## Host to Relu viewer envelope

All SDK-level messages sent to the iframe are wrapped like this:

```json
{
  "protocol": "relu-medical-viewer-iframe-api",
  "version": "0.2.0",
  "message": {
    "type": "authConfig",
    "payload": {},
    "messageId": "optional",
    "timestamp": 1778080000000
  }
}
```

The iframe target origin is derived from the configured `viewerUrl`. Messages are rejected unless the browser event origin matches that viewer origin.

## Initial handshake

After iframe creation and again every 1500 ms until readiness, the host sends:

```json
{
  "type": "authConfig",
  "payload": {
    "auth": {
      "type": "apiToken",
      "token": "server-issued-relu-token"
    },
    "integratorId": "interoral",
    "hostApiVersion": "0.2.0",
    "config": {
      "editing_enabled": false,
      "review_mode": true,
      "shader": "high-def-glossy",
      "render_quality": "high",
      "glossy": true,
      "auto_load_latest": true,
      "hashed_id": "deidentified-case-hash",
      "case_id": "medit-case-id-or-internal-case-id",
      "theme": {
        "branding": "relu"
      }
    }
  }
}
```

The Medit case context reaches Relu through `initialConfig.hashed_id` and `initialConfig.case_id`. The existing repo gets those values from Magic Mirror props. The new portal gets them from a signed gateway token, then passes them into the same iframe config fields.

## Viewer to host readiness

The SDK bridge listens for:

```json
{
  "protocol": "relu-medical-viewer-iframe-api",
  "version": "0.2.0",
  "message": {
    "type": "ready",
    "payload": {
      "app": {
        "appId": "relu-automate",
        "version": "..."
      },
      "viewerVersion": "...",
      "capabilities": ["save", "getState"]
    }
  }
}
```

The legacy Magic Mirror also listens for non-envelope readiness aliases from the viewer:

- `relu:ready`
- `relu:design_loaded`
- `design_loaded`
- `viewer_ready`
- `ready`

The new portal keeps this compatibility.

## Viewer auth refresh

SDK envelope:

```json
{
  "type": "authRequired"
}
```

The host answers by making an RPC-style call:

```json
{
  "protocol": "relu-medical-viewer-iframe-api",
  "version": "0.2.0",
  "message": {
    "type": "updateToken",
    "messageId": "1778080000000-1",
    "payload": {
      "token": "fresh-server-issued-relu-token"
    },
    "timestamp": 1778080000000
  }
}
```

Legacy non-envelope auth request kept by Magic Mirror:

```json
{ "type": "RELU_AUTH_REQUEST" }
```

Legacy response:

```json
{ "type": "RELU_AUTH_RESPONSE", "apiKey": "fresh-server-issued-relu-token" }
```

The new portal keeps this fallback because the current Magic Mirror relies on it.

## RPC calls

The host exposes two implemented calls:

- `save`
- `getState`

Each call includes a `messageId`. The iframe responds with `type` ending in `:response`, the same `messageId`, and either `result` or `error`.

Example response:

```json
{
  "protocol": "relu-medical-viewer-iframe-api",
  "version": "0.2.0",
  "message": {
    "type": "save:response",
    "messageId": "1778080000000-1",
    "result": {
      "success": true,
      "order": {
        "id": "relu-order-id",
        "status": "saved"
      }
    }
  }
}
```

## Approve signals

The current Magic Mirror accepts these approve event names:

- `RELU_APPROVE`
- `approve`
- `case_approved`

The new portal keeps these events, then calls the gateway with the signed case token. It does not write directly to Supabase and does not expose a Relu API key to the browser.
