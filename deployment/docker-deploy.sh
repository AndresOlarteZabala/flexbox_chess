#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

archive="${1:?Indica el paquete del proyecto}"
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
[[ -f "$archive" ]] || fail "No existe el paquete: $archive"
docker compose version >/dev/null || fail "Falta Docker Compose v2."
mapfile -t containers < <(docker ps -a --filter label=com.docker.compose.service=flexbox-chess --format '{{.ID}}')
[[ "${#containers[@]}" -eq 1 ]] || fail "Se esperaba un unico servicio Docker flexbox-chess."
container="${containers[0]}"
label() { docker inspect --format "{{index .Config.Labels \"$1\"}}" "$container"; }
project="$(label com.docker.compose.project)"
workdir="$(label com.docker.compose.project.working_dir)"
config_files="$(label com.docker.compose.project.config_files)"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ && -d "$workdir" && -n "$config_files" ]] || fail "No se pudo localizar la configuracion Compose original."

# A source bind mount would hide the newly built application. Keep data mounts.
while IFS= read -r destination; do
  case "$destination" in
    /app/data|/app/data/*) ;;
    /app|/app/*) fail "El montaje $destination oculta el codigo de la imagen; revisa la configuracion Compose." ;;
  esac
done < <(docker inspect --format '{{range .Mounts}}{{println .Destination}}{{end}}' "$container")
data_mount="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Type}}{{end}}{{end}}' "$container")"
[[ -n "$data_mount" ]] || fail "El contenedor no tiene un volumen en /app/data; se detuvo para conservar los datos."

compose=(docker compose --project-directory "$workdir" -p "$project")
IFS=',' read -r -a configs <<< "$config_files"
for config in "${configs[@]}"; do
  [[ -f "$config" ]] || fail "No existe la configuracion Compose: $config"
  compose+=(-f "$config")
done
release="$HOME/apps/flexbox_chess/docker-releases/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$release/source"
tar -xzf "$archive" -C "$release/source"
[[ -f "$release/source/Dockerfile" ]] || fail "El paquete no contiene Dockerfile."
cd "$workdir"
# Save the resolved original configuration privately, preserving volumes, ports,
# environment, networks and the previous image for rollback.
"${compose[@]}" config > "$release/compose-base.yaml"
previous_image="$(docker inspect --format '{{.Image}}' "$container")"
rollback_image="flexbox-chess:rollback-$(basename "$release")"
docker image tag "$previous_image" "$rollback_image"
cat > "$release/compose-release.yaml" <<EOF
services:
  flexbox-chess:
    image: flexbox-chess:release-$(basename "$release")
    build:
      context: $release/source
      dockerfile: Dockerfile
EOF
cat > "$release/compose-rollback.yaml" <<EOF
services:
  flexbox-chess:
    image: $rollback_image
EOF
base_compose=(docker compose --project-directory "$workdir" -p "$project" -f "$release/compose-base.yaml")
new_compose=("${base_compose[@]}" -f "$release/compose-release.yaml")
rollback() {
  printf 'Restaurando la imagen anterior...\n' >&2
  "${base_compose[@]}" -f "$release/compose-rollback.yaml" up -d --no-deps --no-build flexbox-chess
}
printf 'Construyendo la nueva imagen; el servicio actual sigue activo.\n'
"${new_compose[@]}" build flexbox-chess
printf 'Verificando lectura del codigo y acceso a datos antes de reemplazar el servicio.\n'
"${new_compose[@]}" run --rm --no-deps --entrypoint node flexbox-chess -e '
  const fs = require("node:fs");
  for (const file of ["package.json", "server.js", "app/index.html", "app/css/index.css", "app/js/index.js", "app/js/epic-narrator.js", "app/js/narrator-ui.js"]) {
    fs.readFileSync("/app/" + file);
  }
  for (const dependency of ["express", "cors", "socket.io", "node:sqlite"]) require(dependency);
  fs.accessSync("/app/data", fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  console.log("Codigo y volumen de datos accesibles para el usuario del contenedor.");
'
if ! "${new_compose[@]}" up -d --no-deps --no-build flexbox-chess; then
  rollback
  fail "No se pudo arrancar la nueva version."
fi
for attempt in {1..30}; do
  updated="$("${new_compose[@]}" ps -a -q flexbox-chess)"
  if [[ -n "$updated" ]] && docker exec "$updated" node -e '
    const base = "http://127.0.0.1:" + (process.env.PORT || 5000);
    Promise.all([fetch(base + "/api/bot/levels"), fetch(base + "/").then(async r => ({ok: r.ok && (await r.text()).includes("board-controls-hud") && (await fetch(base + "/js/narrator-ui.js")).ok}))])
      .then(results => process.exit(results.every(r => r.ok) ? 0 : 1)).catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    printf 'Listo: servicio Docker actualizado. Configuracion: %s/compose-release.yaml\n' "$release"
    "${new_compose[@]}" ps flexbox-chess
    exit 0
  fi
  sleep 2
done
"${new_compose[@]}" logs --tail 30 flexbox-chess >&2
rollback
fail "La comprobacion HTTP fallo; se restauro la imagen anterior."
