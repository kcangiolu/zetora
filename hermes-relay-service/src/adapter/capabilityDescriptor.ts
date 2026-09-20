import { config } from '../config.js';

// docs/relay-connector-contract.md §2. This is the handshake payload Zetora returns to
// every connecting Hermes gateway, describing what this platform ("zetora") supports.
// `supports_edit: false` is deliberate, not a placeholder: per §1 of the contract, the
// gateway reads this at handshake to decide whether to stream a reply as one `send` +
// progressive `edit`s, or as one-message-per-segment. Advertising `true` before `edit`
// action-frame handling exists (see index.ts) would make Hermes actually try
// edit-based streaming against a connector that silently drops every edit — flip this to
// `true` only once that handling ships (a phase after basic send/receive).
export function buildDescriptorFrame() {
  return {
    type: 'descriptor',
    descriptor: {
      contract_version: config.contractVersion,
      platform: 'zetora',
      label: 'Zetora',
      max_message_length: 4096,
      supports_draft_streaming: false,
      supports_edit: false,
      supports_threads: false,
      markdown_dialect: 'markdown',
      len_unit: 'chars',
      emoji: '🔷',
      // gateway/relay/descriptor.py's CapabilityDescriptor.supports_op: an EMPTY
      // supported_ops fails open to a legacy set (send/edit/typing/follow_up) — but
      // listing anything here makes it the EXACT set, so this must name every op this
      // service actually implements (adapter.py's _send_prompt checks
      // `supports_op("prompt")` before ever attempting one). "edit"/"typing"/"follow_up"
      // are deliberately omitted: not yet handled (see index.ts), and — since they're
      // no longer fail-open once this array is non-empty — omitting them correctly
      // stops Hermes from trying them rather than silently producing op_not_supported
      // round trips.
      supported_ops: ['send', 'prompt'],
    },
  };
}
