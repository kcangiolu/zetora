// Lexical matching for memory entries, done in TypeScript rather than in
// Postgres: a user has at most a few hundred entries, so scoring them in
// memory is cheap, needs no extension (unaccent / pg_trgm) and is unit-testable.
// Entries carry model-written keywords/synonyms, which is what lets plain
// lexical matching catch rephrasings without embeddings.

const MIN_TOKEN_LENGTH = 3;
// Prefix matching catches simple inflections ("serveur" / "serveurs",
// "deploy" / "deployment") without a per-language stemmer.
const MIN_PREFIX_LENGTH = 5;

// Frequent French/English words of 3+ letters that carry no topic. Shorter
// words are already dropped by MIN_TOKEN_LENGTH.
const STOPWORDS = new Set(
  [
    // French
    'les des une est pas que qui quoi dans pour par sur avec sans sont mais donc car cette ces son ses',
    'mon mes ton tes nos vos leur leurs aux elle ils elles nous vous moi toi lui eux tout tous toute',
    'toutes plus moins tres bien fait faire peux peut veux veut comme comment quand aussi encore alors',
    'quel quelle quels quelles avoir etre suis ete cela ceci oui non merci bonjour salut chose trop peu',
    'ici voici voila entre depuis utilisateur',
    // English
    'the and for are but not you your with this that these those from have has had was were will would',
    'can could should what when where which who how why about into just like more some than then them',
    'they their there also very does did done its our out all any please thanks hello user',
  ]
    .join(' ')
    .split(' '),
);

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function tokenize(text: string): string[] {
  const tokens = normalizeText(text).split(/[^\p{L}\p{N}]+/u);
  return tokens.filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(t));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(shorter);
}

function trigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (const word of normalizeText(text).split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i < padded.length - 2; i++) grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

// Jaccard similarity over word trigrams, same idea as pg_trgm's similarity().
export function trigramSimilarity(a: string, b: string): number {
  const ga = trigrams(a);
  const gb = trigrams(b);
  if (ga.size === 0 || gb.size === 0) return 0;
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return shared / (ga.size + gb.size - shared);
}

export interface MatchableEntry {
  id: string;
  text: string;
  keywords: string[];
}

/**
 * Picks the entries relevant to `query`, best first. An entry qualifies only
 * with a match on one of its keywords (written precisely for this purpose) or
 * on at least two distinct words of its text — a single shared common word is
 * never enough. Returning nothing is the expected outcome for most messages.
 */
export function selectRelevantEntries<T extends MatchableEntry>(entries: T[], query: string, limit: number): T[] {
  const queryTokens = [...new Set(tokenize(query))];
  if (queryTokens.length === 0 || entries.length === 0) return [];

  const indexed = entries.map((entry) => ({
    entry,
    textTokens: new Set(tokenize(entry.text)),
    keywordTokens: new Set(entry.keywords.flatMap(tokenize)),
  }));

  // Inverse document frequency across this user's entries: a word shared by
  // many entries says little about which one is relevant.
  const documentFrequency = (token: string) =>
    indexed.filter(({ textTokens, keywordTokens }) =>
      [...textTokens, ...keywordTokens].some((t) => tokensMatch(t, token)),
    ).length;
  const idf = new Map(queryTokens.map((t) => [t, Math.log(1 + indexed.length / Math.max(1, documentFrequency(t)))]));

  const scored = indexed.flatMap(({ entry, textTokens, keywordTokens }) => {
    let score = 0;
    let keywordHits = 0;
    let textHits = 0;
    for (const token of queryTokens) {
      const inKeywords = [...keywordTokens].some((t) => tokensMatch(t, token));
      const inText = [...textTokens].some((t) => tokensMatch(t, token));
      if (inKeywords) keywordHits++;
      if (inText) textHits++;
      if (inKeywords || inText) score += idf.get(token)! * (inKeywords ? 1.5 : 1);
    }
    return keywordHits >= 1 || textHits >= 2 ? [{ entry, score }] : [];
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => entry);
}
