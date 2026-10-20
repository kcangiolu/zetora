# Zetora plugin for Hermes Agent

Reports every tool call Hermes makes in a Zetora conversation as a structured step
(tool, short preview, outcome, duration), which Zetora shows as live steps and folds away
once the turn is done.

Over the relay, Hermes only sends tool progress as ordinary text messages, with nothing to
tell them apart from a reply. This plugin uses Hermes's public `pre_tool_call` /
`post_tool_call` hooks instead and POSTs each event to the relay service
(`/relay/tool-event`), signed with the gateway's own relay secret.

## Install

On the machine running the Hermes gateway enrolled with Zetora:

```bash
cp -r hermes-plugin/zetora ~/.hermes/plugins/zetora
hermes plugins enable zetora
```

Then turn off Hermes's text tool progress for Zetora, which the steps replace, in
`~/.hermes/config.yaml`:

```yaml
display:
  platforms:
    relay:
      tool_progress: off
```

The plugin reads `GATEWAY_RELAY_URL`, `GATEWAY_RELAY_ID` and `GATEWAY_RELAY_SECRET`, which
`hermes gateway enroll` already set. Delivery failures are logged as warnings in
`~/.hermes/logs/agent.log` and never affect the agent.

`hermes plugins list` shows the plugin as failed if Hermes moves the session context it
reads to tell which Zetora chat a tool call belongs to.
