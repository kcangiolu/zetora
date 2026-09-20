import { config } from '../config.js';

// docs/relay-connector-contract.md §2. This is the handshake payload Zetora returns to
// every connecting Hermes gateway, describing what this platform ("zetora") supports.
// `supports_edit: true`: the gateway reads this at handshake to decide whether to stream
// a reply as one `send` + progressive `edit`s, or as one-message-per-segment — now safe
// to advertise since `edit` action-frame handling exists (see agent-event/route.ts).
export function buildDescriptorFrame() {
  return {
    type: 'descriptor',
    descriptor: {
      contract_version: config.contractVersion,
      platform: 'zetora',
      label: 'Zetora',
      max_message_length: 4096,
      supports_draft_streaming: false,
      supports_edit: true,
      supports_threads: false,
      markdown_dialect: 'markdown',
      len_unit: 'chars',
      emoji: '🔷',
      // gateway/relay/descriptor.py's CapabilityDescriptor.supports_op: an EMPTY
      // supported_ops fails open to a legacy set (send/edit/typing/follow_up) — but
      // listing anything here makes it the EXACT set, so this must name every op this
      // service actually implements (adapter.py's _send_prompt checks
      // `supports_op("prompt")` before ever attempting one). "follow_up" is deliberately
      // omitted: not yet handled (see index.ts) — proactive sends need session_key
      // routing, a separately-scoped feature, not a one-line addition like the others.
      supported_ops: ['send', 'prompt', 'edit', 'typing', 'react', 'send_media'],
    },
  };
}
