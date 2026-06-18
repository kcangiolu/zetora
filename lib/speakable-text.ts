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

  // 6. Liens markdown → garder uniquement le label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 7. Bold/italic → garder le texte
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 8. Headings → phrase normale (le titre devient une phrase)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1.');

  // 9. Blockquotes → texte simple
  text = text.replace(/^>\s?/gm, '');

  // 10. Listes → phrases normales
  // Listes numérotées : "1. Truc" → "Truc."
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Listes à puces : "- Truc" → "Truc."
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');

  // 11. Caractères spéciaux → texte naturel
  text = text.replace(/→/g, ' donc ');
  text = text.replace(/~/g, 'environ ');
  text = text.replace(/×/g, ' par ');
  text = text.replace(/€/g, ' euros');
  text = text.replace(/%/g, ' pourcent');
  text = text.replace(/&/g, ' et ');
  text = text.replace(/\.{3}/g, '. ');
  text = text.replace(/«\s*/g, '');
  text = text.replace(/\s*»/g, '');

  // 12. Supprimer les URLs brutes
  text = text.replace(/https?:\/\/\S+/g, '');

  // 13. Supprimer tout HTML résiduel
  text = text.replace(/<[^>]*>/g, '');

  // 14. Nettoyer les sauts de ligne
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('. ');

  // 15. Éviter les doubles ponctuations et espaces multiples
  text = text.replace(/\.\s*\./g, '.');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+\./g, '.');
  text = text.replace(/\.+/g, '.');
  text = text.replace(/\s+,/g, ',');

  // 16. Supprimer les caractères de contrôle restants
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return text.trim();
}
