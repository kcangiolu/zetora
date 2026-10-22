# Zetora plugin for Hermes Agent

Reports every tool call Hermes makes in a Zetora conversation as a structured step
(tool, short preview, outcome, duration), which Zetora shows as live steps and folds away
once the turn is done. It can also give Hermes the same long-term memory as your Zetora
chats (see [Memory](#memory)).

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

## Memory

With `memory.provider: zetora`, Hermes uses Zetora's memory instead of its own, in every
conversation (Zetora, other messaging platforms, the CLI):

- your bio and core facts go into Hermes's system prompt, and the facts matching each message
  are recalled before it is answered; facts marked sensitive are never sent;
- after each turn, Zetora decides what is worth remembering, with the same rules as a Zetora
  chat. The update runs on the Memory model picked in Zetora's Settings → AI Models, or, when
  none is picked, on Hermes's own active model;
- the `add_memory` and `search_memories` tools cover explicit requests ("remember that…").

Turning memory off in Zetora's settings turns it off for Hermes too. Hermes's built-in
memory stays separate: turn it off so the agent has one memory, in `~/.hermes/config.yaml`:

```yaml
memory:
  provider: zetora
  memory_enabled: false
  user_profile_enabled: false
```

Subagents and cron runs read the memory but never write to it. Requests that fail are logged
as warnings in `~/.hermes/logs/agent.log` and never affect the turn.
