export function extractSpeakableText(markdown: string): string {
  let text = markdown;

  // 1. Supprimer les blocs de code fencés (```...```)
  text = text.replace(/```[\s\S]*?```/g, '');

  // 2. Supprimer les tableaux markdown (lignes commençant par |, + séparateurs)
  text = text.replace(/^\|.*\|$/gm, '');
  text = text.replace(/^\|?[\s:|-]+\|[\s:|-]+\|?$/gm, '');

  // 3. Supprimer les règles horizontales
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // 4. Supprimer le inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // 5. Supprimer les images
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');

  // 6. Supprimer les sections Sources/Références (heading ou bold) et tout ce qui suit
  text = text.replace(/\n#{1,6}\s*(sources?|références?|references?|liens?|bibliographie)[^\n]*[\s\S]*$/i, '');
  text = text.replace(/\n\*\*(sources?|références?|references?|liens?)[^*]*\*\*[\s\S]*$/i, '');

  // 7. Supprimer les citations inline [Titre](url) entièrement — le label est un titre
  // d'article qui n'a pas de sens à l'oral. Le texte reste cohérent sans lui.
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '');

  // 8. Supprimer les marqueurs de références orphelins [1], [^1], [note]
  text = text.replace(/\[\^?\d+\]/g, '');

  // 9. Bold/italic → garder le texte
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 10. Headings → phrase normale (le titre devient une phrase)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1.');

  // 11. Blockquotes → texte simple
  text = text.replace(/^>\s?/gm, '');

  // 12. Listes → phrases normales
  // Listes numérotées : "1. Truc" → "Truc."
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Listes à puces : "- Truc" → "Truc."
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');

  // 13. Caractères spéciaux → texte naturel
  text = text.replace(/→/g, ' donc ');
  text = text.replace(/~/g, 'environ ');
  text = text.replace(/×/g, ' par ');
  text = text.replace(/€/g, ' euros');
  text = text.replace(/%/g, ' pourcent');
  text = text.replace(/&/g, ' et ');
  text = text.replace(/\.{3}/g, '. ');
  text = text.replace(/«\s*/g, '');
  text = text.replace(/\s*»/g, '');

  // 14. Supprimer les URLs brutes
  text = text.replace(/https?:\/\/\S+/g, '');

  // 15. Supprimer tout HTML résiduel
  text = text.replace(/<[^>]*>/g, '');

  // 16. Nettoyer les sauts de ligne
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('. ');

  // 17. Éviter les doubles ponctuations et espaces multiples
  text = text.replace(/\.\s*\./g, '.');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+\./g, '.');
  text = text.replace(/\.+/g, '.');
  text = text.replace(/\s+,/g, ',');

  // 18. Supprimer les caractères de contrôle restants
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return text.trim();
}
