#!/usr/bin/env bash
# First install: asks where the models come from and, for a full install,
# which services to run and which keys to add, writes .env, starts the stack.
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

# The oldest NVIDIA driver the speech services start on (see README.md).
MIN_NVIDIA_DRIVER=580

# What a full install offers to add, as "VARIABLES|label": the main
# provider's own key is left out of the first list. A variable named in
# PLAIN_VARS is not a secret, so its answer shows as it is typed.
PROVIDER_CHOICES=(
  'OPENAI_API_KEY|OpenAI'
  'ANTHROPIC_API_KEY|Anthropic'
  'XAI_API_KEY|xAI: Grok models, cloud voice and X search'
  'GOOGLE_AI_STUDIO_API_KEY|Google AI Studio: Gemini'
  'GOOGLE_AGENT_PLATFORM_API_KEY GOOGLE_AGENT_PLATFORM_PROJECT|Google Agent Platform: Gemini, billed to Google Cloud'
  'DEEPSEEK_API_KEY|DeepSeek'
  'MISTRAL_API_KEY|Mistral'
  'COHERE_API_KEY|Cohere'
  'ZAI_API_KEY|Zhipu AI (GLM)'
  'MINIMAX_API_KEY|MiniMax'
  'SARVAM_API_KEY|Sarvam'
  'OPENROUTER_API_KEY|OpenRouter: any lab'
  'GROQ_API_KEY|Groq'
  'NOVITA_API_KEY|Novita'
  'AI_GATEWAY_API_KEY|Vercel AI Gateway'
  'HF_TOKEN|Hugging Face: runs zetora-arch-router, the Auto mode classifier'
)
TOOL_CHOICES=(
  'EXA_API_KEY|Exa: web search'
  'FIRECRAWL_API_KEY|Firecrawl: web search and page reading'
  'PARALLEL_API_KEY|Parallel: Reddit search and web search'
  'TAVILY_API_KEY|Tavily: finance and news in stock charts'
  'VALYU_API_KEY|Valyu: prediction markets, finance data and currency conversion'
  'NOTTE_API_KEY|Notte: reads pages that need a browser'
  'SUPADATA_API_KEY|Supadata: YouTube and social media transcripts'
  'TMDB_API_KEY|TMDB: movies and TV shows'
  'OPENWEATHER_API_KEY|OpenWeather: weather'
  'GOOGLE_MAPS_API_KEY|Google Maps: places and maps'
  'COINGECKO_API_KEY|CoinGecko: crypto prices'
  'AMADEUS_API_KEY AMADEUS_API_SECRET|Amadeus: flight tracking'
  'SPOTIFY_CLIENT_ID SPOTIFY_CLIENT_SECRET|Spotify: music search'
  'ELEVENLABS_API_KEY|ElevenLabs: cloud speech-to-text and text-to-speech'
  'GITHUB_TOKEN|GitHub: repository details in GitHub search'
)
PLAIN_VARS=' GOOGLE_AGENT_PLATFORM_PROJECT SPOTIFY_CLIENT_ID '

# The voice ID of the recording text-to-speech clones (tts-service reads it
# as data/qwen3-tts/voices/<name>.wav, .lang and .txt).
VOICE_NAME='my-voice'

# The languages tts-service knows a recording's language by.
VOICE_LANGUAGES=' french english german spanish italian portuguese chinese japanese korean '

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

# Asks the main provider whether it takes the key in $1, by listing its
# models. Sets key_check to accepted, refused, or unknown when the provider
# could not be reached or gave another answer, and key_status to its HTTP
# status. The key reaches curl on stdin, so it never shows in a process list.
check_key() {
  local url header refused_statuses='401 403'
  case "$provider_key_var" in
    ANTHROPIC_API_KEY)
      url='https://api.anthropic.com/v1/models'
      header='x-api-key: %s\nanthropic-version: 2023-06-01\n'
      ;;
    OPENAI_API_KEY) url='https://api.openai.com/v1/models' ;;
    GOOGLE_AI_STUDIO_API_KEY)
      url='https://generativelanguage.googleapis.com/v1beta/models'
      header='x-goog-api-key: %s\n'
      # Google answers an invalid key with 400 API_KEY_INVALID.
      refused_statuses='400 401 403'
      ;;
    DEEPSEEK_API_KEY) url='https://api.deepseek.com/models' ;;
    ZAI_API_KEY) url='https://api.z.ai/api/paas/v4/models' ;;
    MINIMAX_API_KEY) url='https://api.minimax.io/v1/models' ;;
    # OpenRouter lists its models to anyone; this route needs a valid key.
    OPENROUTER_API_KEY) url='https://openrouter.ai/api/v1/key' ;;
  esac
  key_status="$(printf "${header:-Authorization: Bearer %s\n}" "$1" |
    curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H @- "$url" 2>/dev/null)" || key_status=''
  case " $refused_statuses " in
    *" $key_status "*) key_check=refused ;;
    *)
      case "$key_status" in
        2??) key_check=accepted ;;
        *) key_check=unknown ;;
      esac
      ;;
  esac
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

# A key, single-quoted like the main provider's.
set_key() {
  set_env "$1" "'$2'"
}

# $2 is what Enter answers: y or n.
ask_yes_no() {
  local hint='[y/N]'
  [ "$2" = y ] && hint='[Y/n]'
  while true; do
    ask "$1 $hint "
    case "${REPLY:-$2}" in
      y | Y | yes) return 0 ;;
      n | N | no) return 1 ;;
    esac
    printf 'Answer y or n.\n'
  done
}

# Lists pick_labels by number and sets picked to the numbers chosen, each
# between spaces. $1 is what Enter answers: all or none.
ask_picks() {
  local count=${#pick_labels[@]} index number valid
  index=0
  while [ "$index" -lt "$count" ]; do
    printf '  %2d) %s\n' "$((index + 1))" "${pick_labels[$index]}"
    index=$((index + 1))
  done
  while true; do
    ask "Numbers separated by spaces, all or none [$1]: "
    picked=' '
    case "${REPLY:-$1}" in
      none) return ;;
      all)
        index=1
        while [ "$index" -le "$count" ]; do
          picked="$picked$index "
          index=$((index + 1))
        done
        return
        ;;
    esac
    valid=true
    for number in ${REPLY:-$1}; do
      if [[ "$number" =~ ^[0-9]+$ ]] && [ "$number" -ge 1 ] && [ "$number" -le "$count" ]; then
        picked="$picked$number "
      else
        valid=false
      fi
    done
    [ "$valid" = true ] && return
    printf 'Pick numbers from 1 to %s.\n' "$count"
  done
}

is_picked() {
  case "$picked" in
    *" $1 "*) return 0 ;;
  esac
  return 1
}

# Offers the "VARIABLES|label" entries given as arguments and stores a value
# for each variable of the ones picked. Sets added_vars to every variable
# stored so far, each between spaces.
ask_choice_keys() {
  local entry vars variable number
  pick_labels=()
  pick_vars=()
  for entry in "$@"; do
    pick_vars[${#pick_vars[@]}]="${entry%%|*}"
    pick_labels[${#pick_labels[@]}]="${entry#*|}"
  done
  ask_picks none
  number=1
  for vars in "${pick_vars[@]}"; do
    if is_picked "$number"; then
      for variable in $vars; do
        case "$PLAIN_VARS" in
          *" $variable "*) ask_plain "$variable: " ;;
          *) ask_key "$variable: " ;;
        esac
        set_key "$variable" "$REPLY"
        added_vars="$added_vars$variable "
      done
    fi
    number=$((number + 1))
  done
}

# Like ask_key, for a value that is not a secret.
ask_plain() {
  while true; do
    ask "$1"
    REPLY="${REPLY//[[:space:]]/}"
    case "$REPLY" in
      '' | *\'* | *\"* | *\\*) printf 'A value cannot be empty or contain quotes or backslashes.\n' ;;
      *) return ;;
    esac
  done
}

add_profile() {
  profiles="${profiles:+$profiles,}$1"
}

add_custom_provider() {
  custom_providers="${custom_providers:+$custom_providers,}$1"
}

# Sets gpu_issue to why local voice cannot run here, or to nothing.
check_gpu() {
  local driver
  gpu_issue=''
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    gpu_issue='no NVIDIA GPU found (nvidia-smi is missing)'
    return
  fi
  driver="$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -n 1)" || driver=''
  if ! [[ "${driver%%.*}" =~ ^[0-9]+$ ]]; then
    gpu_issue='nvidia-smi did not give the driver version'
  elif [ "${driver%%.*}" -lt "$MIN_NVIDIA_DRIVER" ]; then
    gpu_issue="NVIDIA driver $driver found, the speech services need $MIN_NVIDIA_DRIVER or newer"
  elif ! docker info --format '{{range $name, $runtime := .Runtimes}}{{$name}} {{end}}' 2>/dev/null | grep -qw nvidia; then
    gpu_issue="Docker has no nvidia runtime: install the NVIDIA Container Toolkit"
  fi
}

# A path as a terminal hands it over when a file is dropped on it: quoted,
# or with its spaces escaped, and ~ for the home folder.
clean_path() {
  local path="$1"
  path="${path%"${path##*[![:space:]]}"}"
  path="${path#"${path%%[![:space:]]*}"}"
  case "$path" in
    \'*\' | \"*\") path="${path:1:${#path}-2}" ;;
  esac
  path="${path//\\ / }"
  case "$path" in
    '~'/*) path="$HOME/${path#'~'/}" ;;
  esac
  printf '%s' "$path"
}

base64url() {
  openssl base64 -A | tr '+/' '-_' | tr -d '='
}

# Web Push keys, in the form browsers take them: the raw P-256 public point
# and private scalar, base64url. A P-256 key in SEC1 DER starts with 7 bytes
# of header before its 32-byte scalar, and its public key in DER ends with
# the 65-byte point.
make_vapid_keys() {
  local pem
  pem="$(mktemp)"
  openssl ecparam -name prime256v1 -genkey -noout -out "$pem" 2>/dev/null
  vapid_public="$(openssl ec -in "$pem" -pubout -outform DER 2>/dev/null | tail -c 65 | base64url)"
  vapid_private="$(openssl ec -in "$pem" -outform DER 2>/dev/null | head -c 39 | tail -c 32 | base64url)"
  rm -f "$pem"
}

# The questions of a full install, after the models. Each answer goes into
# the draft .env right away.
full_setup() {
  printf '\nMore AI providers, beside the one above (pick none to skip):\n'
  local entry choices=()
  for entry in "${PROVIDER_CHOICES[@]}"; do
    [ "${entry%%|*}" = "$provider_key_var" ] || choices[${#choices[@]}]="$entry"
  done
  ask_choice_keys "${choices[@]}"

  case "$added_vars" in
    *' XAI_API_KEY '*)
      printf '\nX search runs on an xAI model.\n'
      catalog_provider='xai'
      catalog_source='xai'
      catalog_aggregator=false
      if list_models; then
        index=0
        while [ "$index" -lt "$model_count" ]; do
          printf '  %2d) %s  (%s)\n' "$((index + 1))" "${model_labels[$index]}" "${model_ids[$index]}"
          index=$((index + 1))
        done
      fi
      while true; do
        ask 'Model for X search, by number or xai:model id, or Enter to set it later: '
        REPLY="${REPLY//[[:space:]]/}"
        [ -z "$REPLY" ] && break
        if [[ "$REPLY" =~ ^[0-9]+$ ]] && [ "$REPLY" -ge 1 ] && [ "$REPLY" -le "$model_count" ]; then
          REPLY="${model_ids[$((REPLY - 1))]}"
        fi
        if [[ "$REPLY" =~ ^xai:[A-Za-z0-9._/:-]+$ ]]; then
          set_env ZETORA_MODEL_X_SEARCH "$REPLY"
          break
        fi
        printf 'Pick a number from the list, or type an xai:model id.\n'
      done
      ;;
  esac

  printf '\nSelf-hosted services, run on this machine'"'"'s CPU:\n'
  pick_labels=(
    'Silo: file storage, for uploads and generated files'
    'SearXNG: web search'
    'fastCRW: reads web pages for answers'
    'BullMQ: runs Lookouts, the scheduled searches'
    'Qdrant: Hybrid Search over past results'
    'Presidio: masks personal data before it reaches a model'
  )
  ask_picks all
  if is_picked 1; then
    add_profile minio
    storage_password="$(openssl rand -hex 24)"
    set_env MINIO_ROOT_PASSWORD "$storage_password"
    # The browser reaches Silo on its published port, the app on the
    # Docker network.
    set_env MINIO_SERVER_URL http://localhost:9010
    set_env S3_ENDPOINT http://minio:9000
    set_env S3_ACCESS_KEY_ID minioadmin
    set_env S3_SECRET_ACCESS_KEY "$storage_password"
    set_env S3_PUBLIC_URL http://localhost:9010/zetora-uploads
    set_env S3_PRESIGN_ENDPOINT http://localhost:9010
    set_env S3_REGION us-east-1
    set_env S3_FORCE_PATH_STYLE true
  fi
  if is_picked 2; then
    add_profile searxng
    set_env SEARXNG_URL http://searxng:8080
  fi
  if is_picked 3; then
    add_profile fastcrw
    set_env FASTCRW_URL http://fastcrw:3000
  fi
  if is_picked 4; then
    add_profile bullmq
    set_env LOOKOUT_SCHEDULER bullmq
    set_env BULLMQ_REDIS_PASSWORD "$(openssl rand -hex 24)"
  fi
  if is_picked 5; then
    add_profile qdrant
    set_env QDRANT_URL http://qdrant:6333
  fi
  if is_picked 6; then
    add_profile presidio
    set_env ANONYMIZER_API_URL http://presidio-api:8000
  fi

  printf '\nThe code interpreter runs Python in throwaway containers, which the sandbox starts\n'
  printf 'through Docker'"'"'s socket: that gives it the same power as root on this machine.\n'
  if ask_yes_no 'Run the code sandbox here?' n; then
    add_profile sandbox
    set_env SANDBOX_PROVIDER docker
  fi

  printf '\nLocal voice: speech-to-text, text-to-speech and live voice chat, on an NVIDIA GPU.\n'
  check_gpu
  if [ -n "$gpu_issue" ]; then
    printf 'Not offered: %s.\n' "$gpu_issue"
  elif ask_yes_no 'Set up local voice? Its first build takes up to two hours.' n; then
    local_voice=true
    add_profile voice
    add_profile tts
    set_env VOICE_S2S_URL ws://localhost:8100/v1/realtime
    add_custom_provider '{"id":"local-stt","name":"Local speech-to-text","baseURL":"http://stt-service:8080/v1","disableAutoDetect":true}'
    add_custom_provider '{"id":"local-tts","name":"Local text-to-speech","baseURL":"http://qwen3-tts:8080/v1","disableAutoDetect":true}'
    ask_voice_sample
  fi

  printf '\nHermes Agent (experimental): talk to your own Hermes Agent gateway from Zetora.\n'
  if ask_yes_no 'Turn it on? The gateway has to run on this machine.' n; then
    hermes=true
    add_profile hermes
    set_env NEXT_PUBLIC_HERMES_ENABLED true
    set_env HERMES_GATEWAY_SECRET_ENCRYPTION_KEY "$(openssl rand -hex 32)"
    set_env HERMES_RELAY_INTERNAL_SECRET "$(openssl rand -hex 32)"
    set_env HERMES_RELAY_PUBLIC_URL ws://localhost:8201
    make_vapid_keys
    set_env VAPID_PUBLIC_KEY "$vapid_public"
    set_env NEXT_PUBLIC_VAPID_PUBLIC_KEY "$vapid_public"
    set_env VAPID_PRIVATE_KEY "$vapid_private"
    set_env VAPID_SUBJECT mailto:admin@example.com
  fi

  printf '\nExperimental features:\n'
  if ask_yes_no 'Apps, where users connect their own MCP servers?' n; then
    set_env NEXT_PUBLIC_MCP_ENABLED true
  fi
  if ask_yes_no 'Canvas, a mode that builds interactive dashboards?' n; then
    set_env NEXT_PUBLIC_CANVAS_ENABLED true
  fi

  printf '\nKeys for tools and search providers (pick none to skip):\n'
  ask_choice_keys "${TOOL_CHOICES[@]}"
}

# The recording text-to-speech clones its voice from. Sets voice_file,
# voice_language and voice_text; voice_file stays empty when skipped.
ask_voice_sample() {
  printf 'Text-to-speech speaks in the voice of a recording you give it: 10 to 20 seconds\n'
  printf 'of one person speaking clearly, as .wav, .mp3, .flac or .m4a.\n'
  while true; do
    ask 'Path to the recording, or Enter to add one later: '
    voice_file="$(clean_path "$REPLY")"
    [ -z "$voice_file" ] && return
    case "$voice_file" in
      *.wav | *.mp3 | *.flac | *.m4a)
        [ -f "$voice_file" ] && break
        printf 'No file at %s.\n' "$voice_file"
        ;;
      *) printf 'Use a .wav, .mp3, .flac or .m4a file.\n' ;;
    esac
  done
  while true; do
    ask 'Language spoken in it, e.g. french or english: '
    voice_language="$(printf '%s' "${REPLY//[[:space:]]/}" | tr '[:upper:]' '[:lower:]')"
    case "$VOICE_LANGUAGES" in
      *" $voice_language "*) break ;;
    esac
    printf 'One of:%s\n' "$VOICE_LANGUAGES"
  done
  ask 'What it says, word for word, for a closer voice, or Enter to skip: '
  voice_text="$REPLY"
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

printf 'Zetora setup\n\nWhat should this install set up?\n'
printf '  1) Quick: the app, its database and SearXNG web search, in a few questions\n'
printf '  2) Full: also each self-hosted service, local voice, Hermes Agent, and keys for\n'
printf '     more providers and tools\n'
full=false
# What the answers add up to, filled in as they come.
profiles=''
custom_providers=''
added_vars=' '
local_voice=false
hermes=false
voice_file=''
while true; do
  ask 'Choice [1-2]: '
  case "$REPLY" in
    1) break ;;
    2)
      full=true
      break
      ;;
    *) printf 'Pick 1 or 2.\n' ;;
  esac
done

printf '\nWhere should the models come from?\n'
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
      provider_name='Anthropic'
      provider_key_var='ANTHROPIC_API_KEY'
      catalog_provider='anthropic'
      catalog_source='anthropic'
      ;;
    2)
      provider_name='OpenAI'
      provider_key_var='OPENAI_API_KEY'
      catalog_provider='openai'
      catalog_source='openai'
      ;;
    3)
      provider_name='Google AI Studio'
      provider_key_var='GOOGLE_AI_STUDIO_API_KEY'
      catalog_provider='google'
      catalog_source='google'
      ;;
    4)
      provider_name='DeepSeek'
      provider_key_var='DEEPSEEK_API_KEY'
      catalog_provider='deepseek'
      catalog_source='deepseek'
      ;;
    5)
      provider_name='Zhipu AI'
      provider_key_var='ZAI_API_KEY'
      catalog_provider='zhipu'
      catalog_source='zai'
      ;;
    6)
      provider_name='MiniMax'
      provider_key_var='MINIMAX_API_KEY'
      catalog_provider='minimax'
      catalog_source='minimax'
      ;;
    7)
      provider_name='OpenRouter'
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
  add_custom_provider "{\"id\":\"local\",\"name\":\"Local\",\"baseURL\":\"$endpoint_url\",\"apiKey\":\"${endpoint_key:-local}\"}"
  # The id above is what makes these names custom-local-*, see .env.example.
  printf 'Name the models as your server lists them. The same name twice is fine.\n'
  ask_model 'Main model, for chat and research: ' "$LOCAL_MODEL_FORM" 'Use the name your server lists, without spaces.'
  main_model="custom-local-$REPLY"
  ask_model 'Small model, for titles and suggestions: ' "$LOCAL_MODEL_FORM" 'Use the name your server lists, without spaces.'
  small_model="custom-local-$REPLY"
else
  ask_key "$provider_key_var: "
  while true; do
    check_key "$REPLY"
    case "$key_check" in
      accepted)
        printf '%s accepted the key.\n' "$provider_name"
        break
        ;;
      unknown)
        printf 'Could not check the key with %s, so it is kept as typed.\n' "$provider_name"
        break
        ;;
    esac
    printf '%s refused this key (HTTP %s). Check it, then type it again.\n' "$provider_name" "$key_status"
    ask_key "$provider_key_var: "
  done
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

if [ "$provider_key_var" != 'CUSTOM_AI_PROVIDERS' ]; then
  set_env "$provider_key_var" "$provider_value"
fi
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
set_env ZETORA_SERVICES_BIND 127.0.0.1
set_env REQUIRE_EMAIL_VERIFICATION false

set_env COMPOSE_FILE docker-compose.yml:docker-compose.build.yml

if [ "$full" = true ]; then
  full_setup
else
  add_profile searxng
  set_env SEARXNG_URL http://searxng:8080
fi
[ -n "$profiles" ] && set_env COMPOSE_PROFILES "$profiles"
[ -n "$custom_providers" ] && set_env CUSTOM_AI_PROVIDERS "'[$custom_providers]'"

# The SearXNG container runs under its own user and must be able to read this,
# and the text-to-speech one the voice recording.
(
  umask 022
  case ",$profiles," in
    *,searxng,*)
      mkdir -p data/searxng
      if [ ! -e data/searxng/settings.yml ]; then
        sed "s/CHANGE_ME_openssl_rand_hex_32/$(openssl rand -hex 32)/" searxng/settings.yml >data/searxng/settings.yml
      fi
      ;;
  esac
  if [ -n "$voice_file" ]; then
    mkdir -p data/qwen3-tts/voices
    cp "$voice_file" "data/qwen3-tts/voices/$VOICE_NAME.${voice_file##*.}"
    printf '%s\n' "$voice_language" >"data/qwen3-tts/voices/$VOICE_NAME.lang"
    if [ -n "$voice_text" ]; then
      printf '%s\n' "$voice_text" >"data/qwen3-tts/voices/$VOICE_NAME.txt"
    fi
  fi
)

mv "$env_draft" .env
printf '\nWrote .env.\n'

next_step='Create your account: no email is sent, you are signed in right away.'

# What is left to do in the app, once it runs.
print_next_steps() {
  printf '%s\n' "$next_step"
  if [ "$local_voice" = true ]; then
    printf '\nLocal voice: in Settings → Voice, set both providers to Custom (OpenAI-compatible),\n'
    printf 'Local speech-to-text for speech-to-text and Local text-to-speech for text-to-speech.\n'
    if [ -n "$voice_file" ]; then
      printf 'Its voice ID is %s, its language %s.\n' "$VOICE_NAME" "$voice_language"
    else
      printf 'Text-to-speech needs a recording first: put it in data/qwen3-tts/voices/ as NAME.wav,\n'
      printf 'with its language in NAME.lang, and use NAME as the voice ID (see "Quick start" in README.md).\n'
    fi
  fi
  if [ "$hermes" = true ]; then
    printf '\nHermes Agent: open Settings → Hermes, run the command it gives on this machine,\n'
    printf 'then install the plugin, see hermes-plugin/zetora/README.md.\n'
  fi
  case ",$profiles,$added_vars" in
    *,searxng,* | *' EXA_API_KEY '* | *' FIRECRAWL_API_KEY '* | *' PARALLEL_API_KEY '*) ;;
    *) printf '\nNo search provider: answers come from the model alone. See "Choose a setup" in README.md.\n' ;;
  esac
  return 0
}

if [ "$start_stack" = false ]; then
  printf 'Start it with: docker compose up -d --build\nThen open %s\n' "$APP_URL"
  print_next_steps
  exit 0
fi

if [ "$local_voice" = true ]; then
  printf 'Building and starting. The first build takes several minutes, up to two hours with local voice.\n\n'
else
  printf 'Building and starting. The first build takes several minutes.\n\n'
fi
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

printf '\n\nZetora is running: %s\n' "$APP_URL"
print_next_steps

# Only the app's container can tell: a server the host reaches may still be
# closed to containers. Any HTTP answer will do, as this call sends no key.
if [ "$provider_key_var" = 'CUSTOM_AI_PROVIDERS' ] &&
  ! docker compose exec -T zetora.app node -e "fetch(process.argv[1], { signal: AbortSignal.timeout(5000) }).then(() => process.exit(0), () => process.exit(1))" "${endpoint_url%/}/models"; then
  printf '\nWarning: the app cannot reach %s, so chats will fail until it can.\n' "$endpoint_url"
  printf 'Check that the model server listens on more than 127.0.0.1, and that no firewall blocks containers\nfrom its port (with ufw: sudo ufw allow from 172.16.0.0/12 to any port PORT).\n'
fi
printf 'It only answers on this machine. To open it to others, see "Option 2" in README.md.\n'
