#!/usr/bin/env bash
# Host tooling for local development: the pinned Node, however this machine
# likes to get it. `make setup` runs this; there is no `mise`/`node` target,
# because nobody types them.
#
# The alternative -- printing "Node 14 is too old, go install 20" -- is a
# correct message that still leaves the reader to do the work, and this is the
# first command anyone runs after cloning.
set -u

want=$(sed -n 's/^node *= *"\(.*\)"/\1/p' mise.toml | tr -d ' ')
want=${want:-22}

have_major=0
if command -v node >/dev/null 2>&1; then
  v=$(node --version 2>/dev/null || echo v0)   # v22.11.0
  have_major=${v#v}; have_major=${have_major%%.*}
fi

if [ "$have_major" -ge "${want%%.*}" ] 2>/dev/null; then
  echo "node $(node --version) already satisfies the pin (${want})"
  exit 0
fi

echo "node is missing or too old (have: ${have_major:-none}, need: ${want})"

# Use whatever version manager the machine already has before installing one.
if command -v mise >/dev/null 2>&1; then
  # READS the checked-in pin rather than writing one, so it cannot drift from
  # .nvmrc, package.json engines, or the CI workflow.
  mise trust && mise install && mise current
elif [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm install && nvm use          # both read .nvmrc
else
  echo "installing mise (https://mise.jdx.dev) to manage the pinned node"
  curl -fsSL https://mise.run | sh
  export PATH="$HOME/.local/bin:$PATH"
  mise trust && mise install && mise current
fi

if ! command -v node >/dev/null 2>&1 || \
   [ "$(node --version | sed 's/v//; s/\..*//')" -lt "${want%%.*}" ]; then
  # Installed through mise but not on this shell's PATH: every npm call in the
  # Makefile goes through bin/npm.sh, which runs mise's node by itself, so
  # setup can carry on. Activating mise is only needed to type node/npm by hand.
  if command -v mise >/dev/null 2>&1 && \
     [ "$(mise exec -- node --version 2>/dev/null | sed 's/v//; s/\..*//')" -ge "${want%%.*}" ] 2>/dev/null; then
    echo "using mise's node $(mise exec -- node --version) for this repo"
    echo "(to use it in your own shell too:  eval \"\$(mise activate bash)\")"
    exit 0
  fi
  cat <<MSG

The pinned node is installed but not on PATH in this shell. Activate it, then
re-run \`make setup\`:

  mise:  eval "\$(mise activate bash)"     # add to ~/.bashrc to make it stick
  nvm:   nvm use

MSG
  exit 1
fi
