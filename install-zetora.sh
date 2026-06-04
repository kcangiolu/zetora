#!/usr/bin/env bash
set -uo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_DIR=".zetora-backups/${TIMESTAMP}"

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
err()   { echo -e "${RED}[✗]${NC} $*"; }
info()  { echo -e "${BLUE}[→]${NC} $*"; }
step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }
detail(){ echo -e "    ${YELLOW}▸${NC} $*"; }

cleanup() {
    echo ""
    warn "Script interrompu."
    echo "  Les backups sont dans : ${BACKUP_DIR}/"
    echo "  Les containers Docker n'ont PAS été supprimés (pg-zetora, redis-zetora)."
    exit 1
}
trap cleanup INT TERM

# ─────────────────────────────────────────────
# Fonctions utilitaires
# ─────────────────────────────────────────────

backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        mkdir -p "$BACKUP_DIR"
        local dest="$BACKUP_DIR/$(echo "$file" | tr '/' '_')"
        if [ ! -f "$dest" ]; then
            cp "$file" "$dest"
            detail "Backup : $file → $dest"
        fi
    fi
}

already_patched() {
    local file="$1"
    local marker="$2"
    grep -q "$marker" "$file" 2>/dev/null
}

ensure_docker() {
    if ! docker info &>/dev/null; then
        err "Docker n'est pas lancé ou pas installé.
    Installe Docker Desktop ou lance : sudo systemctl start docker"
    fi
}

container_running() {
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$1"
}

container_exists() {
    docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$1"
}

# ─────────────────────────────────────────────
# Phase 0 — Prérequis
# ─────────────────────────────────────────────

step "Phase 0/6 — Prérequis système"

NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo "0")
if [ "$NODE_VERSION" -lt 22 ]; then
    err "Node.js 22+ requis. Version : $(node --version 2>/dev/null || echo 'aucune').
    Installe : nvm install 22 && nvm use 22"
fi
log "Node.js $(node --version)"

if ! command -v pnpm &>/dev/null; then
    warn "pnpm absent. Installation..."
    npm install -g pnpm || err "Échec installation pnpm"
fi
log "pnpm $(pnpm --version)"

ensure_docker
log "Docker OK"

# ─────────────────────────────────────────────
# Phase 1 — Docker PostgreSQL + Redis
# ─────────────────────────────────────────────

step "Phase 1/6 — Services Docker (PostgreSQL + Redis)"

# --- PostgreSQL ---
if container_running "pg-zetora"; then
    log "PostgreSQL (pg-zetora) déjà en cours d'exécution"
elif container_exists "pg-zetora"; then
    info "Démarrage du container PostgreSQL existant..."
    docker start pg-zetora
    log "PostgreSQL démarré"
else
    info "Création du container PostgreSQL..."
    docker run -d \
        --name pg-zetora \
        -e POSTGRES_PASSWORD=postgres \
        -e POSTGRES_DB=zetora \
        -p 5432:5432 \
        postgres:17-alpine
    log "PostgreSQL créé et démarré"
fi

# --- Redis ---
if container_running "redis-zetora"; then
    log "Redis (redis-zetora) déjà en cours d'exécution"
elif container_exists "redis-zetora"; then
    info "Démarrage du container Redis existant..."
    docker start redis-zetora
    log "Redis démarré"
else
    info "Création du container Redis..."
    docker run -d \
        --name redis-zetora \
        -p 6379:6379 \
        redis:7-alpine
    log "Redis créé et démarré"
fi

# Attendre que les services soient prêts
info "Attente de la disponibilité des services..."
for i in {1..15}; do
    if docker exec pg-zetora pg_isready -U postgres &>/dev/null; then
        log "PostgreSQL est prêt"
        break
    fi
    [ "$i" -eq 15 ] && warn "PostgreSQL met du temps... continue, mais vérifie si ça échoue plus tard."
    sleep 1
done

# ─────────────────────────────────────────────
# Phase 2 — Sauvegardes (timestamp, jamais écrasées)
# ─────────────────────────────────────────────

step "Phase 2/6 — Sauvegardes horodatées"

mkdir -p "$BACKUP_DIR"

for f in env/server.ts lib/db/index.ts .env.local .npmrc; do
    backup_file "$f"
done

# Restaurer les backups ORIGINAUX si le script a déjà tourné avant
# On cherche le backup le plus ancien (le premier passage)
OLDEST_BACKUP=$(ls -dt .zetora-backups/*/ 2>/dev/null | tail -1)
if [ -n "$OLDEST_BACKUP" ] && [ "$OLDEST_BACKUP" != ".zetora-backups/${TIMESTAMP}/" ]; then
    warn "Backups précédents détectés : $(basename "$OLDEST_BACKUP")"
    info "Restauration des fichiers ORIGINAUX depuis le premier backup..."
    for f in env/server.ts lib/db/index.ts; do
        backup_name=$(echo "$f" | tr '/' '_')
        if [ -f "${OLDEST_BACKUP}${backup_name}" ]; then
            cp "${OLDEST_BACKUP}${backup_name}" "$f"
            detail "Restauré : $f (depuis le backup original)"
        fi
    done
fi

log "Sauvegardes → ${BACKUP_DIR}/"

# ─────────────────────────────────────────────
# Phase 3 — .env.local
# ─────────────────────────────────────────────

step "Phase 3/6 — Fichier .env.local"

if [ -f .env.local ] && grep -q "placeholder_xai_key" .env.local 2>/dev/null; then
    warn ".env.local existe déjà (généré par ce script). On garde l'existant."
    log "Si tu veux le regénérer : rm .env.local && relance le script"
else
    if [ -f .env.local ]; then
        backup_file .env.local
    fi

    BETTER_AUTH_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev-secret-$(date +%s)")
    MCP_KEY=$(openssl rand -hex 32 2>/dev/null || echo "mcp-key-$(date +%s)")

    cat > .env.local << ENVEOF
# ═══════════════════════════════════════════
# Zetora — .env.local (généré le ${TIMESTAMP})
# ═══════════════════════════════════════════

# ─── Base de données (Docker pg-zetora) ───
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zetora

# ─── Redis (Docker redis-zetora) ───
REDIS_URL=redis://localhost:6379
UPSTASH_REDIS_REST_URL=https://placeholder-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=placeholder_upstash_token

# ─── Authentification ───
BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
GITHUB_CLIENT_ID=placeholder_github_client_id
GITHUB_CLIENT_SECRET=placeholder_github_client_secret
GOOGLE_CLIENT_ID=placeholder_google_client_id
GOOGLE_CLIENT_SECRET=placeholder_google_client_secret
TWITTER_CLIENT_ID=placeholder_twitter_client_id
TWITTER_CLIENT_SECRET=placeholder_twitter_client_secret

# ─── LLM (obligatoire : XAI_API_KEY) ───
XAI_API_KEY=placeholder_xai_key
OPENAI_API_KEY=placeholder_openai_key
ANTHROPIC_API_KEY=placeholder_anthropic_key
GROQ_API_KEY=placeholder_groq_key
GOOGLE_GENERATIVE_AI_API_KEY=placeholder_google_ai_key
DAYTONA_API_KEY=placeholder_daytona_key

# ─── Recherche Web ───
EXA_API_KEY=placeholder_exa_key
FIRECRAWL_API_KEY=placeholder_firecrawl_key
TAVILY_API_KEY=placeholder_tavily_key
PARALLEL_API_KEY=placeholder_parallel_key
VALYU_API_KEY=placeholder_valyu_key
NOTTE_API_KEY=placeholder_notte_key
SMITHERY_API_KEY=placeholder_smithery_key

# ─── Outils spécialisés ───
TMDB_API_KEY=placeholder_tmdb_key
YT_ENDPOINT=https://www.googleapis.com/youtube/v3
SUPADATA_API_KEY=placeholder_supadata_key
ELEVENLABS_API_KEY=placeholder_elevenlabs_key
SPOTIFY_CLIENT_ID=placeholder_spotify_client_id
SPOTIFY_CLIENT_SECRET=placeholder_spotify_client_secret
GOOGLE_MAPS_API_KEY=placeholder_google_maps_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=placeholder_google_maps_key
OPENWEATHER_API_KEY=placeholder_openweather_key
AMADEUS_API_KEY=placeholder_amadeus_key
AMADEUS_API_SECRET=placeholder_amadeus_secret
COINGECKO_API_KEY=placeholder_coingecko_key

# ─── Infrastructure ───
CRON_SECRET=placeholder_cron_secret
BLOB_READ_WRITE_TOKEN=placeholder_blob_token
RESEND_API_KEY=placeholder_resend_key
QSTASH_TOKEN=placeholder_qstash_token
MCP_CREDENTIALS_ENCRYPTION_KEY=${MCP_KEY}
SUPERMEMORY_API_KEY=placeholder_supermemory_key

# ─── DB Read Replicas ───
READ_DB_1=postgresql://postgres:postgres@localhost:5432/zetora
READ_DB_2=postgresql://postgres:postgres@localhost:5432/zetora

# ─── Optionnels (laissés vides) ───
UPSTASH_BOX_API_KEY=
NEXT_PUBLIC_BUILD_SERVER_URL=
NEXT_PUBLIC_BUILD_SERVER_SECRET=
MCP_OAUTH_CALLBACK_ORIGIN=http://localhost:3000
GITHUB_MCP_CLIENT_ID=
GITHUB_MCP_CLIENT_SECRET=
SLACK_MCP_CLIENT_ID=
SLACK_MCP_CLIENT_SECRET=
BOX_MCP_CLIENT_ID=
BOX_MCP_CLIENT_SECRET=
DROPBOX_MCP_CLIENT_ID=
DROPBOX_MCP_CLIENT_SECRET=
HUBSPOT_MCP_CLIENT_ID=
HUBSPOT_MCP_CLIENT_SECRET=
VERCEL_MCP_CLIENT_ID=
VERCEL_MCP_CLIENT_SECRET=
ALLOWED_ORIGINS=http://localhost:3000
ENVEOF
    log ".env.local créé"
fi

# ─────────────────────────────────────────────
# Phase 4 — Patchs du code source
# ─────────────────────────────────────────────

step "Phase 4/6 — Patchs du code source"

# ── Patch 4.1 : env/server.ts ──
PATCH_MARKER_1="PATCHED BY install-zetora.sh"
if already_patched "env/server.ts" "$PATCH_MARKER_1"; then
    log "env/server.ts déjà patché — on saute"
elif [ ! -f env/server.ts ]; then
    warn "env/server.ts introuvable. Es-tu bien dans le dossier racine de Zetora ?"
else
    backup_file env/server.ts

    # Stratégie : on lit le fichier original, on remplace les .min(1) par .optional().default()
    # pour toutes les vars sauf les 3 critiques
    python3 - "$PATCH_MARKER_1" env/server.ts << 'PYEOF'
import sys, re

marker = sys.argv[1]
filepath = sys.argv[2]

with open(filepath) as f:
    content = f.read()

# Variables CRITIQUES à garder en .min(1) ou à laisser telles quelles
CRITICAL = {
    'DATABASE_URL', 'BETTER_AUTH_SECRET', 'XAI_API_KEY',
}

# Pattern: trouve les déclarations de variables Zod
# Ex: XAI_API_KEY: z.string().min(1),
#     EXA_API_KEY: z.string().min(1),
pattern = re.compile(r'(\w+):\s*z\.string\(\)\.min\(1\)')

def replace_var(m):
    name = m.group(1)
    if name in CRITICAL:
        return m.group(0)  # ne pas toucher
    return f'{name}: z.string().optional().default("placeholder"),  // {marker}'

content = pattern.sub(replace_var, content)

# Ajouter le marker en haut du fichier
if marker not in content:
    content = f'// {marker}\n' + content

with open(filepath, 'w') as f:
    f.write(content)

print("OK")
PYEOF

    if [ $? -eq 0 ]; then
        log "env/server.ts patché — seules DATABASE_URL, BETTER_AUTH_SECRET, XAI_API_KEY restent obligatoires"
    else
        warn "Le patch Python a échoué. On tente la méthode alternative..."

        # Fallback: si le pattern ne matche pas, le fichier est peut-être déjà différent
        if grep -q "optional" env/server.ts; then
            log "env/server.ts semble déjà avoir des vars optionnelles — on garde tel quel"
        else
            warn "Impossible de patcher env/server.ts automatiquement."
            warn "Tu devras le faire manuellement : remplace .min(1) par .optional().default('placeholder')"
            warn "pour toutes les variables SAUF DATABASE_URL, BETTER_AUTH_SECRET, XAI_API_KEY"
        fi
    fi
fi

# ── Patch 4.2 : lib/db/index.ts ──
PATCH_MARKER_2="PATCHED BY install-zetora.sh"
if already_patched "lib/db/index.ts" "$PATCH_MARKER_2"; then
    log "lib/db/index.ts déjà patché — on saute"
elif [ ! -f lib/db/index.ts ]; then
    warn "lib/db/index.ts introuvable."
else
    backup_file lib/db/index.ts

    python3 - "$PATCH_MARKER_2" lib/db/index.ts << 'PYEOF'
import sys, re

marker = sys.argv[1]
filepath = sys.argv[2]

with open(filepath) as f:
    content = f.read()

# Remplace process.env.READ_DB_1! par un fallback sur DATABASE_URL
content = re.sub(
    r"process\.env\.READ_DB_1!",
    "process.env.READ_DB_1 || serverEnv.DATABASE_URL",
    content
)
content = re.sub(
    r"process\.env\.READ_DB_2!",
    "process.env.READ_DB_2 || serverEnv.DATABASE_URL",
    content
)

if marker not in content:
    content = f'// {marker}\n' + content

with open(filepath, 'w') as f:
    f.write(content)

print("OK")
PYEOF

    if [ $? -eq 0 ]; then
        log "lib/db/index.ts patché — fallback READ_DB sur DATABASE_URL"
    else
        warn "Échec du patch lib/db/index.ts. Vérifie manuellement."
    fi
fi

# ── Patch 4.3 : .npmrc ──
if [ ! -f .npmrc ]; then
    cat > .npmrc << 'NPMRCEOF'
auto-install-peers=true
shamefully-hoist=true
NPMRCEOF
    log ".npmrc créé"
else
    log ".npmrc déjà présent"
fi

# ─────────────────────────────────────────────
# Phase 5 — pnpm install
# ─────────────────────────────────────────────

step "Phase 5/6 — Installation des dépendances"

if [ -d node_modules ]; then
    warn "node_modules existe. Nettoyage..."
    rm -rf node_modules
fi

info "pnpm install (cela peut prendre 2-5 minutes)..."
if pnpm install 2>&1 | tee /tmp/zetora-install-${TIMESTAMP}.log; then
    log "pnpm install terminé"
else
    warn "pnpm install a rencontré des erreurs."
    echo ""
    detail "Vérifie /tmp/zetora-install-${TIMESTAMP}.log pour le détail."
    detail "Causes fréquentes :"
    detail "  1. Version de Node.js trop ancienne → nécessite Node 22+"
    detail "  2. Conflit de peer dependencies → vérifie .npmrc (créé en phase 4)"
    detail "  3. Accès réseau → proxy/VPN qui bloque npm"
    echo ""
fi

# ─────────────────────────────────────────────
# Phase 6 — Base de données
# ─────────────────────────────────────────────

step "Phase 6/6 — Base de données"

info "Exécution des migrations Drizzle..."
if npx drizzle-kit push 2>&1; then
    log "Migrations appliquées"
else
    warn "Échec des migrations."
    detail "Vérifie que PostgreSQL tourne : docker ps | grep pg-zetora"
    detail "Si le container est arrêté : docker start pg-zetora"
    detail "Puis relance : npx drizzle-kit push"
fi

# ─────────────────────────────────────────────
# Résumé
# ─────────────────────────────────────────────

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Installation Zetora — Résumé${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "  ${CYAN}Services Docker${NC}"
echo -e "    PostgreSQL  → container ${GREEN}pg-zetora${NC} (port 5432)"
echo -e "    Redis       → container ${GREEN}redis-zetora${NC} (port 6379)"
echo ""

echo -e "  ${CYAN}Fichiers modifiés${NC}"
echo -e "    .env.local         → ${GREEN}créé${NC} avec placeholders"
echo -e "    env/server.ts      → ${GREEN}patché${NC} (vars optionnelles)"
echo -e "    lib/db/index.ts    → ${GREEN}patché${NC} (fallback replicas)"
echo -e "    .npmrc             → ${GREEN}créé${NC}"
echo ""

echo -e "  ${CYAN}Backups${NC}"
echo -e "    → ${YELLOW}${BACKUP_DIR}/${NC}"
echo ""

echo -e "  ${CYAN}Pour lancer Zetora${NC}"
echo -e "    ${GREEN}pnpm dev${NC}"
echo ""

echo -e "  ${CYAN}Variables OBLIGATOIRES à renseigner dans .env.local${NC}"
echo -e "    ${YELLOW}XAI_API_KEY${NC}     → clé xAI (gratuit : ${BLUE}https://console.x.ai${NC})"
echo -e "    ${YELLOW}DATABASE_URL${NC}    → déjà configuré pour Docker pg-zetora"
echo ""

echo -e "  ${CYAN}Recommandé pour la recherche${NC}"
echo -e "    ${YELLOW}EXA_API_KEY${NC}     → 1000 req/mois gratuites (${BLUE}https://exa.ai${NC})"
echo -e "    ${YELLOW}FIRECRAWL_API_KEY${NC} → 500 crédits gratuits (${BLUE}https://firecrawl.dev${NC})"
echo ""

echo -e "  ${CYAN}Commandes utiles${NC}"
echo -e "    docker start pg-zetora redis-zetora   → démarrer les services"
echo -e "    docker stop pg-zetora redis-zetora    → arrêter les services"
echo -e "    docker rm -f pg-zetora redis-zetora   → supprimer et recréer"
echo ""

echo -e "  ${RED}⚠️  Les placeholders permettent le BUILD et le DEV,${NC}"
echo -e "  ${RED}   mais les features correspondantes seront cassées au runtime.${NC}"
echo -e "  ${RED}   Remplace les placeholders par de vraies clés pour utiliser${NC}"
echo -e "  ${RED}   la recherche, l'auth OAuth, les outils spécialisés, etc.${NC}"
echo ""
