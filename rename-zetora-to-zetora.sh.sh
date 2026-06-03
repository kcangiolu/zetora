#!/bin/bash
set -e

PROJECT_ROOT="${1:-.}"
cd "$PROJECT_ROOT"

echo "=== Rename Scira → Zetora ==="
echo ""

# ── 1. Rename files & directories containing "scira" ──
echo "[1/4] Renaming files and directories..."
find . -depth -name "*scira*" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  | while read -r f; do
    dir=$(dirname "$f")
    base=$(basename "$f")
    newbase=$(echo "$base" | sed 's/scira/zetora/g')
    if [ "$base" != "$newbase" ]; then
      echo "  $f → $dir/$newbase"
      mv "$f" "$dir/$newbase"
    fi
  done
echo ""

# ── 2. Replace in file contents ──
echo "[2/4] Replacing Scira → Zetora and scira → zetora in source files..."

find . -type f \
  \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \
     -o -name "*.json" -o -name "*.md" -o -name "*.mdx" \
     -o -name "*.css" -o -name "*.scss" -o -name "*.html" \
     -o -name "*.yml" -o -name "*.yaml" -o -name "*.toml" \
     -o -name "*.env*" -o -name "*.txt" -o -name "*.xml" \
     -o -name "*.svg" \) \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/.next/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -path "*pnpm-lock*" \
  -not -path "*package-lock*" \
  | while read -r f; do
    if grep -q -E '[Ss]cira' "$f" 2>/dev/null; then
      sed -i \
        -e 's/Scira/Zetora/g' \
        -e 's/scira/zetora/g' \
        "$f"
      echo "  $f"
    fi
  done
echo ""

# ── 3. Fix package.json name ──
echo "[3/4] Updating package.json name..."
if [ -f package.json ]; then
  sed -i 's/"name": *"scira"/"name": "zetora"/' package.json
  sed -i 's/"name": *"zetora"/"name": "zetora"/' package.json
  echo "  package.json ✓"
fi
echo ""

# ── 4. Summary ──
echo "[4/4] Done."
echo ""
remaining=$(grep -r -l -E '[Ss]cira' --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.json" --include="*.md" --include="*.css" . 2>/dev/null | grep -v node_modules | grep -v .git | grep -v .next | wc -l)
echo "Files still containing 'Scira' or 'scira': $remaining"
echo ""
echo "Run: git diff --stat   to review changes"
echo "Run: git add -A && git commit -m 'Rename Scira → Zetora'   to commit"
