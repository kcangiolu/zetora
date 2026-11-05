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
  /(?<!!|\(|\]\(https?:\/\/[^\s)]+\)[ \t]*)\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)(?=[ \t]*([\p{Ll}\p{N}.,;:!?)%"'’»]))/gu;

// A citation placed before the sentence's closing punctuation ("… acetate
// [The Science of Alcohol Intolerance](url).") is followed by punctuation too,
// and keeping its words would paste the source's title into the sentence. Words
// a sentence links are short and usually start in lowercase; a source title
// does not start in lowercase (scripts without case, such as Japanese, never
// do) and is long or carries a title separator. Scripts written without spaces
// have no words to count, hence the length in characters as well.
const TITLE_SEPARATOR = /[:?|：？｜]|\s[-–—]\s/;
const TITLE_MIN_WORDS = 4;
const TITLE_MIN_CHARACTERS = 30;

function looksLikeSourceTitle(text: string): boolean {
  const title = text.trim();
  if (/^\p{Ll}/u.test(title)) return false;
  return (
    TITLE_SEPARATOR.test(title) ||
    title.split(/\s+/).length >= TITLE_MIN_WORDS ||
    [...title].length >= TITLE_MIN_CHARACTERS
  );
}

export function keepInlineLinkText(markdown: string): string {
  return markdown.replace(LINK_INSIDE_SENTENCE, (link, text: string, url: string, next: string) => {
    if (text === url) return link;
    const followedByWord = /[\p{Ll}\p{N}]/u.test(next);
    if (!followedByWord && looksLikeSourceTitle(text)) return link;
    return `${text} ${link}`;
  });
}
