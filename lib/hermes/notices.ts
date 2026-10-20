// Hermes posts gateway.notify.no_home_channel at the start of every relay session, offering
// /sethome — which its own /sethome handler always rejects for a relay source, so the notice
// can never be acted on. It is matched on what Hermes itself injects into that template in
// every locale (the 📬 prefix, the "Relay" platform name, the command), never on the
// translated sentence, so the check holds whatever language Hermes runs in.
export function isUnactionableHomeChannelNotice(content: string): boolean {
  return content.startsWith('📬') && content.includes('Relay') && content.includes('/sethome');
}
