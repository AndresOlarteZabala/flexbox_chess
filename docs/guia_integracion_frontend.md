# Guía de Integración: Conexión de Flexbox Chess con la Nueva API

## 1. Propósito

Esta guía describe el procedimiento técnico detallado para conectar la interfaz gráfica existente de **Flexbox Chess** (`app/index.html`, `app/js/index.js`, `app/js/chess-rules.js`) con la nueva **API de Ajedrez**.

Permite transformar una aplicación que actualmente opera de forma local y monolítica en un cliente de ajedrez cliente-servidor capaz de disputar partidas persistentes, multijugador y con soporte para partidas lentas (asíncronas) o con reloj.

---

## 2. Mapa de Transformación de Componentes

| Componente Actual (`flexbox_chess`)          | Función Actual                                | Comportamiento con la Nueva API                                                                     |
| -------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `loadNew()` en `index.js`                    | Carga `data/initial.json` estático            | Llama a `GET /api/v1/games/:gameId` para cargar el estado del tablero y jugadores.                  |
| `drop(ev)` en `chess-rules.js`               | Valida jugadas localmente en JS del navegador | Envía `POST /api/v1/games/:gameId/moves` con `{ from, to }`. Espera confirmación del servidor.      |
| `startClock(data)`                           | Cuenta segundos hacia arriba en el cliente    | Sincroniza cuenta regresiva con `white_time_remaining_ms` y `black_time_remaining_ms` del servidor. |
| `#movements` (Tabla)                         | Renderiza texto `id -> {fila}{col}`           | Renderiza Notación Algebraica Estándar (`SAN` o `UCI`) provista por el servidor.                    |
| Puntuación `#white_points` / `#black_points` | Suma manual de atributos `points`             | Actualizado según el conteo oficial devuelto por la API.                                            |

---

## 3. Modificaciones Paso a Paso

### 3.1. Configuración de Sesión y Partida Activa (`index.js`)

Crear un objeto de configuración global en el cliente:

```javascript
// Configuración de conexión con el backend
const API_CONFIG = {
  baseUrl: "http://localhost:5000/api/v1",
  currentGameId: null, // UUID de la partida actual
  currentPlayerId: null, // UUID del jugador local
  playerSide: "white", // 'white' o 'black'
  pollIntervalMs: 3000, // Intervalo de consulta para partidas asíncronas
};
```

---

### 3.2. Carga del Juego desde la API

Reemplazar la función `loadNew()` en `app/js/index.js`:

```javascript
async function loadGameFromApi(gameId) {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/games/${gameId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Player-ID": API_CONFIG.currentPlayerId,
      },
    });

    if (!response.ok) throw new Error("No se pudo cargar la partida");

    const result = await response.json();
    const game = result.data;

    // Actualizar variables de estado
    data.turn = game.turn_count;
    data.side = game.turn;

    // Renderizar posición según FEN o estructura de piezas devuelta
    renderBoardFromFen(game.fen);

    // Actualizar marcadores de reloj y puntos
    updateClocksFromApi(game.clocks);
    $("#white_points").html(game.material_points.white);
    $("#black_points").html(game.material_points.black);

    // Actualizar etiquetas de turno
    turnLabel.html(data.side);
    quantityLabel.html(data.turn);

    // Iniciar sondeo (polling) para partidas asíncronas o escuchar WebSockets
    startOpponentListener(gameId);
  } catch (error) {
    console.error("Error al conectar con la API:", error);
    messageShow("Error al conectar con el servidor");
  }
}
```

---

### 3.3. Refactorización del Evento `drop(ev)` (`chess-rules.js`)

En el sistema actual, `drop(ev)` calcula las coordenadas y aplica el movimiento directamente en el DOM antes de que exista validación externa.

Con la API, el flujo se convierte en **optimista o con confirmación**:

```javascript
async function drop(ev) {
  ev.preventDefault();
  let member = document.getElementById(ev.dataTransfer.getData("id"));
  if (!member) return;

  // 1. Verificar si es el turno y bando del jugador local
  if (data.side !== API_CONFIG.playerSide) {
    messageShow("No es tu turno");
    return;
  }

  let target =
    ev.target.localName === "icon" ? ev.target.parentNode : ev.target;

  // 2. Extraer casillas de origen y destino en notación clásica (ej. "e2", "e4", "c2", "c4")
  const fromSquare = member.parentNode.id; // ej: "b1", "c2"
  const toSquare = target.id; // ej: "c3", "c4"

  if (fromSquare === toSquare) return;

  // 3. Enviar movimiento a la API
  try {
    const response = await fetch(
      `${API_CONFIG.baseUrl}/games/${API_CONFIG.currentGameId}/moves`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Player-ID": API_CONFIG.currentPlayerId,
        },
        body: JSON.stringify({
          from: fromSquare,
          to: toSquare,
          promotion: "q", // Dama por defecto en coronación
        }),
      },
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      // Movimiento ilegal rechazado por el árbitro del backend
      messageShow(result.error?.message || "Movimiento ilegal");
      return;
    }

    const moveData = result.data;

    // 4. Si hubo captura autorizada por el backend, remover pieza rival del DOM
    if (target.children.length > 0) {
      target.removeChild(target.children[0]);
    }

    // 5. Posicionar pieza en el DOM
    member.setAttribute("state", "moved");
    member.setAttribute("col", target.getAttribute("col"));
    member.setAttribute("row", target.getAttribute("row"));
    target.appendChild(member);

    // 6. Registrar jugada en la tabla con notación clásica devuelta por la API
    addApiMovementToTable(moveData);

    // 7. Cambiar turno y sincronizar relojes
    data.side = moveData.next_turn;
    data.turn = moveData.move_number;
    turnLabel.html(data.side);
    quantityLabel.html(data.turn);
    updateClocksFromApi(moveData.clocks);

    // 8. Notificar jaque / jaque mate
    if (moveData.is_checkmate) {
      messageShow(
        "¡Jaque Mate! Victoria para " +
          (moveData.side === "white" ? "Blancas" : "Negras"),
      );
    } else if (moveData.is_check) {
      messageShow("¡Jaque!");
    }
  } catch (err) {
    console.error("Error al emitir movimiento:", err);
    messageShow("Error de comunicación");
  }
}
```

---

### 3.4. Registro de Movimientos con Notación Clásica

Modificar `addToMovementsTable` para aprovechar la notación estándar calculada por el backend:

```javascript
function addApiMovementToTable(moveData) {
  let table = $("#movements tbody");
  // moveData.san contiene por ejemplo: "e4", "Nc3", "Bxf7+", "O-O"
  let notation = moveData.san || `${moveData.from}->${moveData.to}`;
  let timeStr = formatTime(
    Math.floor(
      (moveData.clocks?.[moveData.side + "_time_remaining_ms"] || 0) / 1000,
    ),
  );

  let row = `
    <tr>
      <td>${moveData.side === "white" ? notation : ""}</td>
      <td>${moveData.side === "black" ? notation : ""}</td>
      <td>${timeStr}</td>
    </tr>
  `;
  table.append(row);
}
```

---

### 3.5. Soporte para Partidas Asíncronas (Consultas por Sondeo / Polling)

En partidas de larga duración donde los oponentes mueven con horas de diferencia, el cliente realiza consultas periódicas para detectar si el rival ya movió:

```javascript
let pollTimer = null;

function startOpponentListener(gameId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    // Si ya es mi turno, no necesito sondear el movimiento del oponente
    if (data.side === API_CONFIG.playerSide) return;

    try {
      const res = await fetch(`${API_CONFIG.baseUrl}/games/${gameId}`);
      const json = await res.json();
      const game = json.data;

      // Si el turno cambió hacia el jugador local, actualizar el tablero
      if (game.turn === API_CONFIG.playerSide) {
        renderBoardFromFen(game.fen);
        data.side = game.turn;
        data.turn = game.turn_count;
        turnLabel.html(data.side);
        quantityLabel.html(data.turn);
        updateClocksFromApi(game.clocks);
        messageShow("¡Es tu turno!");
      }
    } catch (e) {
      console.warn("Fallo de sondeo:", e);
    }
  }, API_CONFIG.pollIntervalMs);
}
```

---

## 4. Pruebas de Integración Recomendadas

1. **Prueba de Movimiento Válido de Apertura:**
   - Arrastrar el peón de `e2` a `e4` o de `c2` a `c4`.
   - Verificar que se envíe `{ from: "c2", to: "c4" }`.
   - Verificar que la respuesta contenga `san: "c4"` y que el turno cambie a `black`.

2. **Prueba de Movimiento de Caballo con Salto:**
   - Arrastrar el caballo blanco de `b1` a `c3`.
   - Verificar que el backend acepte el salto sobre peones y responda con `san: "Nc3"` o `"Cc3"`.

3. **Prueba de Movimiento Ilegal:**
   - Intentar mover una torre desde `a1` a `a5` atravesando el peón de `a2`.
   - Verificar que la API rechace el movimiento con HTTP 422 y que la pieza no cambie de casilla en la pantalla.

4. **Prueba de Partida Asíncrona:**
   - Abrir dos pestañas distintas del navegador con diferentes jugadores (`white` y `black`).
   - Mover una pieza con blancas en la pestaña 1.
   - Observar cómo la pestaña 2 detecta el movimiento y actualiza el tablero automáticamente.
