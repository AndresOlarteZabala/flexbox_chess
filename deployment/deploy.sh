#!/usr/bin/env bash
set -Eeuo pipefail

# Run as the SSH account, not as root. sudo is used only for the systemd service.
archive="${1:-./flexbox-chess.tar.gz}"
port="${PORT:-5000}"
base="$HOME/apps/flexbox_chess"
service="flexbox-chess"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ "$EUID" -ne 0 ]] || fail "Ejecuta este script con tu usuario SSH, sin sudo."
[[ -f "$archive" ]] || fail "No existe el paquete: $archive"
[[ "$port" =~ ^[0-9]+$ ]] && (( port >= 1024 && port <= 65535 )) || fail "PORT debe estar entre 1024 y 65535."
[[ "$base" != *[[:space:]]* ]] || fail "La ruta HOME no puede contener espacios."
for tool in node npm tar curl systemctl sudo; do
  command -v "$tool" >/dev/null || fail "Falta $tool. Instala Node.js 22.13+ (o 24 LTS), npm, curl y systemd antes de continuar."
done
node -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22 || (major===22 && minor<13)) process.exit(1); require("node:sqlite");' || fail "Necesitas Node.js 22.13+ con node:sqlite disponible."
sudo -v
node_bin="$(command -v node)"
runtime_path="$(dirname "$node_bin"):/usr/local/bin:/usr/bin:/bin"
release="$base/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$release" "$base/shared/data"
tar -xzf "$archive" -C "$release"
[[ -f "$release/server.js" && -f "$release/package-lock.json" ]] || fail "El paquete no contiene el proyecto esperado."
cd "$release"
npm ci --omit=dev --no-audit --no-fund
node --check server.js

# Keep the database, games and sessions across deployments.
if [[ ! -f "$base/shared/data/initial.json" ]]; then
  cp data/initial.json "$base/shared/data/initial.json"
fi
mv data data-packaged
ln -s "$base/shared/data" data

unit="$(mktemp)"
trap 'rm -f "$unit"' EXIT
cat > "$unit" <<EOF
[Unit]
Description=Flexbox Chess web server
After=network.target

[Service]
Type=simple
User=$(id -un)
WorkingDirectory=$base/current
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=$port
Environment=PATH=$runtime_path
ExecStart=$node_bin $base/current/server.js
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
EOF

previous="$(readlink "$base/current" 2>/dev/null || true)"
ln -s "$release" "$base/current-next-$$"
mv -Tf "$base/current-next-$$" "$base/current"
sudo install -m 0644 "$unit" "/etc/systemd/system/$service.service"
sudo systemctl daemon-reload
sudo systemctl enable "$service"
sudo systemctl restart "$service"

for attempt in {1..20}; do
  if systemctl is-active --quiet "$service" && curl --fail --silent "http://127.0.0.1:$port/api/bot/levels" >/dev/null && curl --fail --silent "http://127.0.0.1:$port/" >/dev/null; then
    printf '\nProyecto cargado y servicio activo. Puerto: %s\n' "$port"
    printf 'Abre: http://192.168.1.210:%s\n' "$port"
    printf 'Archivos: %s/current\nDatos persistentes: %s/shared/data\n' "$base" "$base"
    printf 'Logs: sudo journalctl -u %s -n 50 --no-pager\n' "$service"
    exit 0
  fi
  sleep 1
done
sudo journalctl -u "$service" -n 40 --no-pager
if [[ -n "$previous" && -d "$previous" ]]; then
  ln -s "$previous" "$base/current-rollback-$$"
  mv -Tf "$base/current-rollback-$$" "$base/current"
  sudo systemctl restart "$service"
  printf 'Se restauró la versión anterior del proyecto.\n' >&2
else
  sudo systemctl stop "$service"
fi
fail "La comprobación HTTP falló. Revisa los logs anteriores y si el puerto $port está ocupado."
