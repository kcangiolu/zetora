# hermes-relay-service

Zetora's connector implementation of Hermes Agent's relay/connector protocol
(`docs/relay-connector-contract.md` in the [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)
source, mirrored on the reference `NousResearch/gateway-gateway` connector).

Any Zetora user can run their own Hermes gateway and connect it to their Zetora account —
the gateway dials **out** to this service over WebSocket (works behind NAT, no public IP
needed on the user's side), authenticated per-gateway via an HMAC secret minted at
enrollment (`hermes gateway enroll`).

## Scope boundary — read before touching this service

This service is deliberately a thin, stateless "dumb pipe":

- It holds **no Postgres credentials and no Drizzle import**. Every trust decision
  (is this enrollment token valid? is this gateway's HMAC valid?) and every durable write
  is delegated to `zetora-app`'s `/api/internal/hermes/*` routes, gated by
  `HERMES_RELAY_INTERNAL_SECRET`. See `src/internalClient.ts` — it is the *only* file that
  talks to `zetora-app`.
- All wire-format knowledge (frame shapes, HMAC scheme, the descriptor payload) lives under
  `src/adapter/`. If the relay protocol changes, only that directory should need to change —
  `zetora-app` never sees raw protocol frames, only already-normalized internal API calls.
- Its only state is an in-memory `Map<gatewayId, WebSocket>` (`src/connections.ts`). Losing
  it on restart is fine: a Hermes gateway that gets disconnected reconnects on its own.

## "One WS = one tenant" — do not port in the shared-bot machinery

The relay contract's later phases (§6/§7 in the doc) describe a **shared bot fronting many
tenants** — author-first routing, per-instance scope grants, a relevance-policy management
plane, account-linking DMs, etc. **None of that applies here.** Every Zetora user runs their
*own* independent Hermes gateway and dials in with their *own* per-gateway secret — one
WebSocket connection already *is* one tenant boundary. If you find yourself reaching for
`scope_id`/`guild_id` multi-tenant-guild logic, a capability vault, or the `/manage/*`
routes from that part of the doc, stop — it doesn't apply to Zetora's shape of the feature
and porting it in would be unnecessary complexity, not correctness.

## Protocol version

`config.contractVersion` is hardcoded and logged on every connection. The contract is
additive-only within a version (per its own §9) — bumping this is a deliberate act when a
new field/op is actually adopted, never automatic. The EXPERIMENTAL status means a
*breaking* change is possible without notice; containing all wire knowledge to
`src/adapter/` (above) is the mitigation, not a guarantee it never happens.

## Wire frames (verified against `gateway/relay/ws_transport.py` on the Hermes side, not
just the prose doc)

Newline-delimited JSON over one WebSocket:

```
gateway   -> connector : hello, outbound, interrupt
connector -> gateway   : descriptor, inbound, outbound_result, interrupt_inbound
```

- `hello {type, platform, botId}` — sent immediately by the gateway on connect; we reply
  `descriptor {type, descriptor}` (the `CapabilityDescriptor`). This is the entire Phase 0
  scope.
- `outbound {type, requestId, action}` — the agent's send/prompt actions, flowing gateway →
  connector (i.e. Hermes asks *us* to deliver to the real chat surface). We reply
  `outbound_result {type, requestId, result}`. `edit`/`typing`/etc. actions are not handled —
  `supported_ops` in the descriptor only advertises `send`/`prompt`, so Hermes never sends
  them.
- `inbound {type, event, bufferId?}` — flows connector → gateway: how *we* push a Zetora
  user's message (or a button click) to Hermes.

The upgrade bearer token (`Authorization: Bearer <token>`) is
`base64url(f"{gatewayId}:{exp}:{sig}")` where `exp` is a **unix-seconds** integer (0 =
never expires) and `sig` is a **hex** HMAC-SHA256 digest of `f"{gatewayId}:{exp}"` under the
per-gateway secret — verified by reading `gateway/relay/auth.py` directly, since the prose
doc alone doesn't spell out the hex-vs-base64 and seconds-vs-milliseconds details and
getting either wrong silently breaks every enrollment.

## Local development

```
npm install
npm run dev
```

Requires `ZETORA_INTERNAL_URL` (default `http://zetora-app:3333`, override to
`http://localhost:3333` outside Docker) and `HERMES_RELAY_INTERNAL_SECRET` (must match
`zetora-app`'s env var of the same name) in the environment.

## Deploy

Built and pushed as `zetora-hermes-relay:latest`/`:<sha>` by the `hermes-relay` job in
`.gitea/workflows/docker.yml`, path-filtered on this directory — same pattern as every other
sidecar service (graphiti/tts/stt/s2s/presidio). `docker-compose.yml`'s own image reference
defaults to a `:local` placeholder; the real registry tag is pinned in the deployment host's
own `docker-compose.internal.yml` (not tracked here — see that file's header).
