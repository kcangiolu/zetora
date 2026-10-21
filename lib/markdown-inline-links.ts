// The chat renders every external link as a source chip showing the site's
// domain, so a link's own text never appears in the answer. Models are asked to
// cite after the statement, but many put the link on words of the sentence
// itself ("the [sunshield](url) protects…"), which the chip would swallow. A link
// followed by a lowercase word, a digit or punctuation is part of its sentence:
// keep its words and put the chip after them. Anything else (end of line,
// another link, a new sentence) is a trailing citation and stays a bare chip,
// and so is a link right after another one (a citation group) or right after
// an opening parenthesis ("… heat ([NASA](url)).").
const LINK_INSIDE_SENTENCE =
  /(?<!!|\(|\]\(https?:\/\/[^\s)]+\)[ \t]*)\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)(?=[ \t]*[\p{Ll}\p{N}.,;:!?)%"'’»])/gu;

export function keepInlineLinkText(markdown: string): string {
  return markdown.replace(LINK_INSIDE_SENTENCE, (link, text: string, url: string) =>
    text === url ? link : `${text} ${link}`,
  );
}
