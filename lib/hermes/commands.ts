// Mirrored from Hermes Agent's gateway/relay/command_manifest.py. Hermes broadcasts no
// command manifest to relay connectors, so this copy needs a manual re-sync whenever
// Hermes adds or renames a command.
export interface HermesCommand {
  name: string;
  description: string;
  hasArgs?: boolean;
}

const HERMES_COMMANDS: HermesCommand[] = [
  { name: 'new', description: 'Start a new conversation' },
  { name: 'reset', description: 'Reset your Hermes session' },
  { name: 'model', description: 'Show or change the model', hasArgs: true },
  { name: 'reasoning', description: 'Show/change reasoning effort, or toggle showing it', hasArgs: true },
  { name: 'personality', description: 'Set a personality', hasArgs: true },
  { name: 'retry', description: 'Retry your last message' },
  { name: 'undo', description: 'Remove the last exchange' },
  { name: 'status', description: 'Show Hermes session status' },
  { name: 'sethome', description: 'Set this chat as the home channel' },
  { name: 'stop', description: 'Stop the running Hermes agent' },
  { name: 'steer', description: 'Inject a message after the next tool call (no interrupt)', hasArgs: true },
  { name: 'compress', description: 'Compress conversation context' },
  { name: 'title', description: 'Set or show the session title', hasArgs: true },
  { name: 'resume', description: 'Resume a previously-named session', hasArgs: true },
  { name: 'usage', description: 'Show token usage for this session' },
  { name: 'help', description: 'Show available commands' },
  { name: 'insights', description: 'Show usage insights and analytics' },
  { name: 'reload-mcp', description: 'Reload MCP servers from config' },
  { name: 'reload-skills', description: 'Re-scan skills for new or removed entries' },
  { name: 'voice', description: 'Toggle voice reply mode' },
  { name: 'update', description: 'Update Hermes Agent to the latest version' },
  { name: 'restart', description: 'Gracefully restart the Hermes gateway' },
  { name: 'approve', description: 'Approve a pending dangerous command', hasArgs: true },
  { name: 'deny', description: 'Deny a pending dangerous command', hasArgs: true },
  { name: 'thread', description: 'Create a new thread and start a Hermes session in it', hasArgs: true },
  { name: 'queue', description: "Queue a prompt for the next turn (doesn't interrupt)", hasArgs: true },
  { name: 'bg', description: 'Run a prompt in a separate background session', hasArgs: true },
  { name: 'btw', description: 'Ask a side question about the current conversation', hasArgs: true },
];

export function filterHermesCommands(filter: string): HermesCommand[] {
  if (!filter) return HERMES_COMMANDS;
  const lower = filter.toLowerCase();
  return HERMES_COMMANDS.filter(
    (c) => c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower),
  );
}
