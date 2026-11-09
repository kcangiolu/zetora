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
main_example=''
small_example=''
while [ -z "$provider_key_var" ]; do
  ask 'Choice [1-8]: '
  case "$REPLY" in
    1)
      provider_key_var='ANTHROPIC_API_KEY'
      main_example='anthropic:claude-sonnet-5-5'
      small_example='anthropic:claude-haiku-5-5'
      ;;
    2)
      provider_key_var='OPENAI_API_KEY'
      main_example='openai:gpt-6.1-sol'
      small_example='openai:gpt-6-luna'
      ;;
    3)
      provider_key_var='GOOGLE_AI_STUDIO_API_KEY'
      main_example='google:gemini-4-argon'
      small_example='google:gemini-3.5-flash-lite'
      ;;
    4)
      provider_key_var='DEEPSEEK_API_KEY'
      main_example='deepseek:deepseek-flash'
      small_example='deepseek:deepseek-flash'
      ;;
    5)
      provider_key_var='ZAI_API_KEY'
      main_example='zhipu:glm-5.3-flashx'
      small_example='zhipu:glm-5.3-flash'
      ;;
    6)
      provider_key_var='MINIMAX_API_KEY'
      main_example='minimax:MiniMax-M3'
      small_example='minimax:MiniMax-M3.1-Flash'
      ;;
    7)
      provider_key_var='OPENROUTER_API_KEY'
      main_example='anthropic:claude-sonnet-5-5'
      small_example='anthropic:claude-haiku-5-5'
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
  ask_model "Main model, for chat and research (e.g. $main_example): " "$CATALOG_MODEL_FORM" 'Use the lab:model form, as in the example.'
  main_model="$REPLY"
  ask_model "Small model, for titles and suggestions (e.g. $small_example): " "$CATALOG_MODEL_FORM" 'Use the lab:model form, as in the example.'
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
