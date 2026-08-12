#!/usr/bin/env bash
# Create the local development MCP bearer token once and show it on demand.
# The generated env file is git-ignored, mode 0600, and loaded only by Deno and
# the optional developer CLI container—not by Vite or the browser.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
token_file="${MCP_TOKEN_FILE:-$repo_dir/.mcp.env}"
show="${1:-}"

read_token() {
  sed -n 's/^MCP_AUTH_TOKEN=//p' "$token_file" | head -1 | tr -d '\r'
}

if [[ -e "$token_file" && ! -f "$token_file" ]]; then
  echo "cannot use $token_file: it is not a regular file" >&2
  exit 1
fi

created=0
if [[ ! -f "$token_file" ]]; then
  if command -v openssl >/dev/null 2>&1; then
    token="$(openssl rand -hex 32)"
  elif [[ -r /proc/sys/kernel/random/uuid ]]; then
    token="$(tr -d '-' < /proc/sys/kernel/random/uuid)$(tr -d '-' < /proc/sys/kernel/random/uuid)"
  else
    token="$(docker run --rm denoland/deno:2.9.5 deno eval \
      'console.log(crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", ""))')"
  fi
  [[ "$token" =~ ^[a-fA-F0-9]{64}$ ]] || {
    echo "failed to generate a valid MCP token" >&2
    exit 1
  }
  umask 077
  temp_file="$(mktemp "$repo_dir/.mcp.env.tmp.XXXXXX")"
  trap 'rm -f "$temp_file"' EXIT
  printf 'MCP_AUTH_TOKEN=%s\n' "$token" > "$temp_file"
  chmod 600 "$temp_file"
  mv "$temp_file" "$token_file"
  trap - EXIT
  created=1
fi

token="$(read_token)"
[[ "$token" =~ ^[a-fA-F0-9]{64}$ ]] || {
  echo "$token_file does not contain a valid 64-character MCP_AUTH_TOKEN" >&2
  echo "fix the file or move it aside, then run: make mcp-env" >&2
  exit 1
}

if [[ "$created" == "1" ]]; then
  echo "created private development MCP token: .mcp.env (mode 0600, git-ignored)"
  echo "MCP token: $token"
  echo "show it again: make mcp-token"
elif [[ "$show" == "--show" ]]; then
  echo "MCP URL (host):      http://localhost:4001/mcp"
  echo "MCP URL (container): http://host.docker.internal:4001/mcp"
  echo "MCP token:           $token"
  echo "Header:              Authorization: Bearer $token"
fi
