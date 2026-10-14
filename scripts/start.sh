#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo " ShareX — Local File Sharing"
echo " ============================"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo " ERROR: Node.js is not installed."
  echo " Install via: https://nodejs.org/ or your package manager"
  exit 1
fi

# Install backend deps
if [ ! -d "$ROOT/backend/node_modules" ]; then
  echo " Installing backend dependencies..."
  cd "$ROOT/backend" && npm install
fi

# Build backend if needed
if [ ! -d "$ROOT/backend/dist" ]; then
  echo " Building backend..."
  cd "$ROOT/backend" && npm run build
fi

# Build frontend if needed
if [ ! -d "$ROOT/frontend/dist" ]; then
  echo " Building frontend..."
  cd "$ROOT/frontend"
  [ ! -d "node_modules" ] && npm install
  npm run build
fi

# Firewall tip (Linux)
echo ""
echo " Tip: If other devices can't connect, allow the port through your firewall:"
echo "   sudo ufw allow 7788/tcp    # UFW"
echo "   sudo firewall-cmd --add-port=7788/tcp --permanent && sudo firewall-cmd --reload  # firewalld"
echo ""

# Start server
echo " Starting ShareX server..."
echo " Open http://localhost:7788 in your browser."
echo ""
cd "$ROOT/backend"
node dist/server.js
