#!/usr/bin/env bash
# First install: asks where the models come from, writes .env, starts the stack.
# Sticks to syntax bash 3.2 understands, the version macOS ships.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

APP_URL='http://localhost:3333'

# ai/models/tasks.ts lists these functions; tests/setup-script.test.ts fails
# when one is added there and not here. Translating images needs vision and
# compaction needs a context as long as the chat's, so neither goes to the
# small model.
MAIN_MODEL_VARS='ZETORA_MODEL_DEFAULT ZETORA_MODEL_EXTREME_PLANNER ZETORA_MODEL_EXTREME_AGENT ZETORA_MODEL_TRANSLATE_VISION ZETORA_MODEL_CONTEXT_COMPACTION'
SMALL_MODEL_VARS='ZETORA_MODEL_CHAT_TITLE ZETORA_MODEL_FOLLOWUP ZETORA_MODEL_ENHANCE ZETORA_MODEL_TOOL_REPAIR ZETORA_MODEL_AUTO_ROUTER ZETORA_MODEL_TRANSLATE_TEXT ZETORA_MODEL_LANG_DETECT ZETORA_MODEL_VOICE ZETORA_MODEL_SEARCH_RERANK'

CATALOG_MODEL_FORM='^[A-Za-z0-9._-]+:[A-Za-z0-9._/:-]+$'
LOCAL_MODEL_FORM='^[A-Za-z0-9._/:-]+$'

# The source of the app's own model catalog. Tests point it at a fixture.
MODELS_DEV_URL="${MODELS_DEV_URL:-https://models.dev/api.json}"

start_stack=true
case "${1:-}" in
  '') ;;
  --no-start) start_stack=false ;;
  *)
    printf 'Usage: ./setup.sh [--no-start]\n' >&2
    exit 2
    ;;
esac

die() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required. $2"
}

ask() {
  printf '%s' "$1"
  IFS= read -r REPLY || die 'input ended before setup finished. Nothing was written.'
}

ask_secret() {
  printf '%s' "$1"
  IFS= read -rs REPLY || die 'input ended before setup finished. Nothing was written.'
  printf '\n'
}

# .env values are single-quoted so Compose leaves $ and # alone, which rules
# out a quote inside them. The local provider's key also goes into JSON.
ask_key() {
  while true; do
    ask_secret "$1"
    REPLY="${REPLY//[[:space:]]/}"
    case "$REPLY" in
      '' | *\'* | *\"* | *\\*) printf 'A key cannot be empty or contain quotes or backslashes.\n' ;;
      *) return ;;
    esac
  done
}

# $2 is the form the answer must have, $3 what to say when it does not.
ask_model() {
  while true; do
    ask "$1"
    REPLY="${REPLY//[[:space:]]/}"
    if [[ "$REPLY" =~ $2 ]]; then
      return
    fi
    printf '%s\n' "$3"
  done
}

# Fills model_ids and model_labels with the provider's current models, as the
# app's catalog lists them (ai/catalog/build.ts): tool calling, text out, not
# retired, released in the last 18 months, a thinking/instant pair as one
# model, one entry per name, and for an aggregator only the labs the app
# knows. Fails, saying why, when models.dev or python3 is out of reach.
list_models() {
  model_ids=()
  model_labels=()
  model_count=0
  if ! command -v python3 >/dev/null 2>&1 || ! command -v curl >/dev/null 2>&1; then
    printf 'python3 and curl are needed to list the models.\n'
    return 1
  fi
  local data listing id label
  data="$(mktemp)"
  listing="$(mktemp)"
  if ! curl -fsS --max-time 30 -o "$data" "$MODELS_DEV_URL"; then
    printf 'Could not reach %s to list the models.\n' "$MODELS_DEV_URL"
    rm -f "$data" "$listing"
    return 1
  fi
  python3 - "$data" "$catalog_source" "$catalog_provider" "$catalog_aggregator" ai/catalog/config.ts >"$listing" <<'PY'
import datetime, json, re, sys

data_path, source, provider, aggregator, config_path = sys.argv[1:6]
models = list(json.load(open(data_path)).get(source, {}).get('models', {}).values())
is_aggregator = aggregator == 'true'
# An aggregator's models are kept only for the labs whose vendor prefixes
# LABS lists.
config = open(config_path).read()
vendors = {v for block in re.findall(r"vendors: \[([^\]]*)\]", config) for v in re.findall(r"'([^']+)'", block)}

today = datetime.date.today()
year, month = today.year, today.month - 18
while month <= 0:
    month += 12
    year -= 1
oldest = '%04d-%02d-%02d' % (year, month, today.day)

def key(text):
    return re.sub(r'[^a-z0-9]', '', text.lower())

def usable(m):
    inputs = (m.get('modalities') or {}).get('input') or ['text']
    outputs = (m.get('modalities') or {}).get('output') or ['text']
    mid = m['id']
    return (m.get('tool_call') is True and m.get('status') != 'deprecated' and 'text' in inputs
            and outputs == ['text'] and ':' not in mid and not mid.startswith('~')
            and (not m.get('release_date') or m['release_date'] >= oldest)
            and (not is_aggregator or ('/' in mid and mid.split('/')[0] in vendors)))

def label(m):
    return re.sub(r'\s*\((latest|\d{4}-\d{2}-\d{2})\)\s*$', '', m['name'], flags=re.I)

candidates = {m['id']: m for m in models if usable(m)}
by_key = {key(mid): mid for mid in candidates}
entries, consumed = [], set()
for mid, m in candidates.items():
    k = key(mid)
    for thinking, instant in (('reasoning', 'nonreasoning'), ('thinking', 'instruct')):
        if not k.endswith(thinking) or k.endswith(instant):
            continue
        twin = by_key.get(k[:-len(thinking)] + instant)
        if not twin:
            continue
        name = re.sub(r'\s*[(-]?\s*(reasoning|thinking)\s*\)?\s*$', '', label(m), flags=re.I)
        stripped = re.sub(r'[-_.]?' + thinking + '$', '', mid, flags=re.I)
        entries.append((stripped, name, m.get('release_date') or ''))
        consumed.update((mid, twin))
        break
entries += [(mid, label(m), m.get('release_date') or '') for mid, m in candidates.items() if mid not in consumed]

pinned = {date for mid, _, date in entries if not mid.endswith('-latest')}
entries = [e for e in entries if not e[0].endswith('-latest') or e[2] not in pinned]
for field in (lambda e: key(e[1]), lambda e: e[0]):
    kept = {}
    for e in entries:
        current = kept.get(field(e))
        if current is None or e[2] > current[2] or (e[2] == current[2] and len(e[0]) < len(current[0])):
            kept[field(e)] = e
    entries = list(kept.values())
entries.sort(key=lambda e: e[1])
entries.sort(key=lambda e: e[2], reverse=True)
for mid, name, _ in entries[:30]:
    print('%s:%s\t%s' % (provider, mid, name))
PY
  [ -s "$listing" ] || {
    printf 'models.dev lists no usable model for this provider.\n'
    rm -f "$data" "$listing"
    return 1
  }
  while IFS="$(printf '\t')" read -r id label; do
    model_ids[$model_count]="$id"
    model_labels[$model_count]="$label"
    model_count=$((model_count + 1))
  done <"$listing"
  rm -f "$data" "$listing"
}

# A number from the list made by list_models, or a provider:model id.
ask_catalog_model() {
  while true; do
    ask "$1"
    REPLY="${REPLY//[[:space:]]/}"
    if [[ "$REPLY" =~ ^[0-9]+$ ]] && [ "$REPLY" -ge 1 ] && [ "$REPLY" -le "$model_count" ]; then
      REPLY="${model_ids[$((REPLY - 1))]}"
      return
    fi
    if [[ "$REPLY" =~ $CATALOG_MODEL_FORM ]]; then
      return
    fi
    printf 'Pick a number from the list, or type a provider:model id.\n'
  done
}

set_env() {
  local next
  next="$(mktemp .env.setup.XXXXXX)"
  KEY="$1" VALUE="$2" awk '
    BEGIN { key = ENVIRON["KEY"]; value = ENVIRON["VALUE"] }
    !found && ($0 ~ "^(# )?" key "=") { print key "=" value; found = 1; next }
    { print }
    END { if (!found) exit 3 }
  ' "$env_draft" >"$next" || {
    rm -f "$next"
    die "$1 is missing from .env.example."
  }
  mv "$next" "$env_draft"
}

[ -f .env.example ] || die '.env.example is missing. Run this script from a full clone of the repository.'

if [ -e .env ]; then
  die '.env already exists, so nothing was changed. To start the stack: docker compose up -d --build. To start over, move .env away first, and data/ too: new passwords do not open an existing database.'
fi

require_command openssl 'It generates the secrets.'
if [ "$start_stack" = true ]; then
  require_command docker 'See https://docs.docker.com/get-docker/'
  require_command curl 'It checks that the app has started.'
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required. See https://docs.docker.com/compose/install/'
  docker info >/dev/null 2>&1 || die 'cannot reach the Docker daemon. Start it, or check that your user may use it.'
fi

printf 'Zetora setup\n\nWhere should the models come from?\n'
printf '  1) Anthropic\n  2) OpenAI\n  3) Google AI Studio\n  4) DeepSeek\n  5) Zhipu AI (GLM)\n  6) MiniMax\n'
printf '  7) OpenRouter (any lab)\n  8) A local or OpenAI-compatible endpoint (Ollama, llama.cpp...)\n'

provider_key_var=''
# The provider's id in ai/catalog/config.ts, where models.dev lists its
# models, and whether it serves several labs' models.
catalog_provider=''
catalog_source=''
catalog_aggregator=false
while [ -z "$provider_key_var" ]; do
  ask 'Choice [1-8]: '
  case "$REPLY" in
    1)
      provider_key_var='ANTHROPIC_API_KEY'
      catalog_provider='anthropic'
      catalog_source='anthropic'
      ;;
    2)
      provider_key_var='OPENAI_API_KEY'
      catalog_provider='openai'
      catalog_source='openai'
      ;;
    3)
      provider_key_var='GOOGLE_AI_STUDIO_API_KEY'
      catalog_provider='google'
      catalog_source='google'
      ;;
    4)
      provider_key_var='DEEPSEEK_API_KEY'
      catalog_provider='deepseek'
      catalog_source='deepseek'
      ;;
    5)
      provider_key_var='ZAI_API_KEY'
      catalog_provider='zhipu'
      catalog_source='zai'
      ;;
    6)
      provider_key_var='MINIMAX_API_KEY'
      catalog_provider='minimax'
      catalog_source='minimax'
      ;;
    7)
      provider_key_var='OPENROUTER_API_KEY'
      catalog_provider='openrouter'
      catalog_source='openrouter'
      catalog_aggregator=true
      ;;
    8) provider_key_var='CUSTOM_AI_PROVIDERS' ;;
    *) printf 'Pick a number from 1 to 8.\n' ;;
  esac
done

if [ "$provider_key_var" = 'CUSTOM_AI_PROVIDERS' ]; then
  while true; do
    ask 'Endpoint URL, e.g. http://localhost:11434/v1: '
    REPLY="${REPLY//[[:space:]]/}"
    case "$REPLY" in
      *\'* | *\"* | *\\*) ;;
      http://?* | https://?*) break ;;
    esac
    printf 'Use a full http:// or https:// URL.\n'
  done
  # Inside the app's container, localhost is the container itself.
  endpoint_url="${REPLY/:\/\/localhost/://host.docker.internal}"
  endpoint_url="${endpoint_url/:\/\/127.0.0.1/://host.docker.internal}"
  ask_secret 'Its API key, or Enter if it has none: '
  endpoint_key="${REPLY//[[:space:]]/}"
  case "$endpoint_key" in
    *\'* | *\"* | *\\*) die 'the key cannot contain quotes or backslashes. Nothing was written.' ;;
  esac
  provider_value="'[{\"id\":\"local\",\"name\":\"Local\",\"baseURL\":\"$endpoint_url\",\"apiKey\":\"${endpoint_key:-local}\"}]'"
  # The id above is what makes these names custom-local-*, see .env.example.
  printf 'Name the models as your server lists them. The same name twice is fine.\n'
  ask_model 'Main model, for chat and research: ' "$LOCAL_MODEL_FORM" 'Use the name your server lists, without spaces.'
  main_model="custom-local-$REPLY"
  ask_model 'Small model, for titles and suggestions: ' "$LOCAL_MODEL_FORM" 'Use the name your server lists, without spaces.'
  small_model="custom-local-$REPLY"
else
  ask_key "$provider_key_var: "
  provider_value="'$REPLY'"
  if list_models; then
    printf '\nCurrent models with tool calling, newest first:\n'
    index=0
    while [ "$index" -lt "$model_count" ]; do
      printf '  %2d) %s  (%s)\n' "$((index + 1))" "${model_labels[$index]}" "${model_ids[$index]}"
      index=$((index + 1))
    done
    printf 'Pick by number, or type any %s:model id.\n' "$catalog_provider"
  else
    printf 'Type %s:model ids; Settings → AI Models lists them once the app runs.\n' "$catalog_provider"
  fi
  ask_catalog_model 'Main model, for chat and research: '
  main_model="$REPLY"
  ask_catalog_model 'Small model, for titles and suggestions: '
  small_model="$REPLY"
fi

# The draft holds secrets until the end, and the last step moves it into place,
# so a failure leaves neither a partial .env nor a readable one.
umask 077
env_draft="$(mktemp .env.setup.XXXXXX)"
trap 'rm -f "$env_draft"' EXIT
cp .env.example "$env_draft"

set_env "$provider_key_var" "$provider_value"
for variable in $MAIN_MODEL_VARS; do
  set_env "$variable" "$main_model"
done
for variable in $SMALL_MODEL_VARS; do
  set_env "$variable" "$small_model"
done

# Hex, because POSTGRES_PASSWORD goes into a connection URL.
set_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_env BETTER_AUTH_SECRET "$(openssl rand -hex 32)"
set_env MCP_CREDENTIALS_ENCRYPTION_KEY "$(openssl rand -hex 32)"

set_env NEXT_PUBLIC_APP_URL "$APP_URL"
set_env BETTER_AUTH_BASE_URL "$APP_URL"
set_env ALLOWED_ORIGINS "$APP_URL"
set_env MCP_OAUTH_CALLBACK_ORIGIN "$APP_URL"
set_env CONTACT_EMAIL ''

# With no email check and open sign-ups, anyone reaching the port could create
# an account and spend the provider key: this install answers on this machine
# only, until its owner decides otherwise.
set_env ZETORA_BIND 127.0.0.1
set_env REQUIRE_EMAIL_VERIFICATION false

set_env COMPOSE_FILE docker-compose.yml:docker-compose.build.yml
set_env COMPOSE_PROFILES searxng
set_env SEARXNG_URL http://searxng:8080

# The SearXNG container runs under its own user and must be able to read this.
(
  umask 022
  mkdir -p data/searxng
  if [ ! -e data/searxng/settings.yml ]; then
    sed "s/CHANGE_ME_openssl_rand_hex_32/$(openssl rand -hex 32)/" searxng/settings.yml >data/searxng/settings.yml
  fi
)

mv "$env_draft" .env
printf '\nWrote .env.\n'

next_step='Create your account: no email is sent, you are signed in right away.'

if [ "$start_stack" = false ]; then
  printf 'Start it with: docker compose up -d --build\nThen open %s\n%s\n' "$APP_URL" "$next_step"
  exit 0
fi

printf 'Building and starting. The first build takes several minutes.\n\n'
docker compose up -d --build

printf '\nWaiting for the app'
attempt=0
until curl -fsS -o /dev/null "$APP_URL"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    printf '\n'
    die 'the app did not answer in time. See: docker compose logs zetora.app'
  fi
  printf '.'
  sleep 2
done 2>/dev/null

printf '\n\nZetora is running: %s\n%s\n' "$APP_URL" "$next_step"

# Only the app's container can tell: a server the host reaches may still be
# closed to containers. Any HTTP answer will do, as this call sends no key.
if [ "$provider_key_var" = 'CUSTOM_AI_PROVIDERS' ] &&
  ! docker compose exec -T zetora.app node -e "fetch(process.argv[1], { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(1))" "${endpoint_url%/}/models"; then
  printf '\nWarning: the app cannot reach %s, so chats will fail until it can.\n' "$endpoint_url"
  printf 'Check that the model server listens on more than 127.0.0.1, and that no firewall blocks containers\nfrom its port (with ufw: sudo ufw allow from 172.16.0.0/12 to any port PORT).\n'
fi
printf 'It only answers on this machine. To open it to others, see "Option 2" in README.md.\n'
