// The chat a /search/<id> URL points to. A new chat moves to its URL with
// history.pushState once the first message is sent, so the path can name a
// chat the page was not rendered for.
export function getChatIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname?.startsWith('/search/')) return null;
  const id = pathname.split('/')[2];
  return id && id !== 'undefined' && id !== 'null' ? id : null;
}
