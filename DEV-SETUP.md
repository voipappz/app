# Development Session Management

This project includes tools to manage your development environment efficiently.

## Quick Start

### Option 1: Simple Script (No Dependencies)

```bash
# Make script executable (first time only)
chmod +x dev-session.sh

# Start your development session
./dev-session.sh
```

This script will:
- Start all Docker Compose services
- Open a tmux session if available, or fall back to simple mode
- Provide quick access to all containers

### Option 2: Tmuxinator (Recommended)

**Install Tmuxinator:**
```bash
# macOS
brew install tmuxinator

# Ubuntu/Debian
sudo apt install tmuxinator

# Or via gem
gem install tmuxinator
```

**Start your session:**
```bash
tmuxinator start
# or
tmuxinator
```

**Stop your session:**
```bash
tmuxinator stop react-dashboard
```

## Session Layout

### Window 1: Main
- **Left pane**: Claude container bash shell
- **Right pane**: React app logs (live tail)

### Window 2: React App
- **Left pane**: React app bash shell
- **Right pane**: Additional bash shell for npm commands

### Window 3: Docker
- **Left pane**: Docker compose status and commands
- **Right pane**: Live container monitoring

## Useful Tmux Commands

```bash
# Switch between windows
Ctrl+b 1    # Go to window 1 (main)
Ctrl+b 2    # Go to window 2 (react-app)
Ctrl+b 3    # Go to window 3 (docker)

# Switch between panes
Ctrl+b ←    # Move to left pane
Ctrl+b →    # Move to right pane
Ctrl+b o    # Cycle through panes

# Detach from session (keeps it running)
Ctrl+b d

# Reattach to session
tmux attach -t react-dashboard

# Kill session completely
tmux kill-session -t react-dashboard
```

## Manual Docker Commands

If you prefer not to use tmux:

```bash
# Start services
docker compose up -d

# Access containers
docker compose exec claude bash
docker compose exec react-app bash

# View logs
docker compose logs -f react-app
docker compose logs -f

# Stop services
docker compose down
```

## Alternative Tools

### Zellij (Modern Alternative to tmux)

```bash
# Install
cargo install zellij

# Use with our session script
./dev-session.sh
```

### Screen

```bash
# Similar to tmux but older
screen -S react-dashboard
```

### VS Code Remote Containers

- Install "Remote - Containers" extension
- Open project in VS Code
- Use Command Palette: "Remote-Containers: Attach to Running Container"

## Troubleshooting

**Permission denied on dev-session.sh:**
```bash
chmod +x dev-session.sh
```

**Containers not starting:**
```bash
docker compose down
docker compose up -d
docker compose ps
```

**Tmuxinator not found:**
```bash
# Check installation
which tmuxinator

# Verify PATH
echo $PATH
```
