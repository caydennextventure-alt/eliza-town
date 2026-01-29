#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://fliza-agent-production.up.railway.app}"
AGENT_ID="${AGENT_ID:-c7cab9c8-6c71-03a6-bd21-a694c8776023}"
USER_ID="${USER_ID:-$(uuidgen | tr 'A-Z' 'a-z')}"

API_KEY="${API_KEY:-}"

curl_with_auth() {
  if [[ -n "$API_KEY" ]]; then
    curl "$@" -H "X-API-KEY: ${API_KEY}"
  else
    curl "$@"
  fi
}

SESSION_JSON=$(curl_with_auth -sS -X POST "$BASE_URL/api/messaging/sessions" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\":\"$AGENT_ID\",\"userId\":\"$USER_ID\"}")

SESSION_ID=$(printf '%s' "$SESSION_JSON" | python -c 'import json, sys
data = json.load(sys.stdin)
session_id = data.get("sessionId")
if not session_id:
    print("Failed to parse sessionId from response", file=sys.stderr)
    sys.exit(1)
print(session_id)
')

STATE_DIR=$(mktemp -d -t werewolf-chat.XXXXXX)
AFTER_FILE="$STATE_DIR/after"

cleanup() {
  rm -rf "$STATE_DIR"
}
trap cleanup EXIT

echo "Session created: $SESSION_ID"
echo "Agent: $AGENT_ID"
echo "User: $USER_ID"
echo "Type /poll to fetch replies, /quit to exit."

fetch_messages() {
  local after=""
  if [[ -f "$AFTER_FILE" ]]; then
    after=$(cat "$AFTER_FILE")
  fi

  local url="$BASE_URL/api/messaging/sessions/$SESSION_ID/messages?limit=20"
  if [[ -n "$after" ]]; then
    url="$BASE_URL/api/messaging/sessions/$SESSION_ID/messages?after=$after&limit=20"
  fi

  local response
  response=$(curl_with_auth -sS "$url" -H "Content-Type: application/json")

  printf '%s' "$response" | python -c 'import json
import sys
from datetime import datetime
from pathlib import Path

after_file = Path(sys.argv[1])
data = json.load(sys.stdin)
messages = data.get("messages", [])

def parse_created_at(message):
    value = message.get("createdAt")
    if value is None:
        return 0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
            try:
                return datetime.fromisoformat(normalized).timestamp()
            except ValueError:
                return 0
    return 0

for message in sorted(messages, key=parse_created_at):
    is_agent = message.get("isAgent")
    author_id = message.get("authorId", "")
    created_at = message.get("createdAt", "")
    content = message.get("content", "")
    tag = "agent" if is_agent else "user"
    if author_id:
        print(f"[{tag} {created_at} {author_id}] {content}")
    else:
        print(f"[{tag} {created_at}] {content}")

cursors = data.get("cursors") or {}
after = cursors.get("after")
if after is not None:
    after_file.write_text(str(after))
' "$AFTER_FILE"
}

build_payload() {
  python - "$1" <<'PY'
import json
import sys

print(json.dumps({"content": sys.argv[1], "mode": "stream"}))
PY
}

print_sse_reply() {
  python -c "$(cat <<'PY'
import json
import sys

event = ""
data_lines = []
collected = ""
final = None

def flush():
    global event, data_lines, collected, final
    if not event and not data_lines:
        return
    data_raw = "\n".join(data_lines)
    parsed = None
    if data_raw:
        try:
            parsed = json.loads(data_raw)
        except json.JSONDecodeError:
            parsed = None
    raw_text = None if parsed else data_raw.strip()
    if event == "chunk":
        chunk = None
        if isinstance(parsed, dict):
            chunk = parsed.get("chunk") or parsed.get("text") or parsed.get("content") or parsed.get("message")
        if isinstance(chunk, str) and chunk:
            collected += chunk
        elif raw_text:
            collected += raw_text
    elif event in ("done", "complete", "message", "agent_message"):
        text = None
        if isinstance(parsed, dict):
            text = parsed.get("text") or parsed.get("content") or parsed.get("message")
        if isinstance(text, str) and text:
            final = text
        elif raw_text:
            final = raw_text
    event = ""
    data_lines = []

for line in sys.stdin:
    line = line.rstrip("\n")
    if line.startswith("event:"):
        event = line[6:].strip()
    elif line.startswith("data:"):
        data_lines.append(line[5:].strip())
    elif line.strip() == "":
        flush()

flush()
reply = final if final else collected
if reply:
    print(f"[agent] {reply}")
PY
)"
}

while true; do
  read -r -p "You> " input || break
  case "$input" in
    /quit|/exit)
      break
      ;;
    /poll)
      fetch_messages
      ;;
    "")
      continue
      ;;
    *)
      payload=$(build_payload "$input")
      curl_with_auth -sS -N -X POST "$BASE_URL/api/messaging/sessions/$SESSION_ID/messages" \
        -H "Content-Type: application/json" \
        -H "Accept: text/event-stream" \
        -d "$payload" | print_sse_reply
      ;;
  esac
done
