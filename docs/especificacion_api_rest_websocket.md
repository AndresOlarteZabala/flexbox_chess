# Especificación Técnica de la API: REST, WebSockets y Persistencia

## 1. Arquitectura General del Sistema

La arquitectura de la solución se compone de tres capas principales:

```text
+-------------------------------------------------------------+
|               Clientes (Web / Flexbox Chess)                |
+-------------------------------------------------------------+
        |                                       ^
  HTTP Peticiones REST                 Eventos en Tiempo Real
  (Jugadas, Crear, Listar)             (WebSockets / SSE)
        v                                       |
+-------------------------------------------------------------+
|                  Capa API Backend (Node.js)                 |
|                                                             |
|  - Controladores REST (/api/v1/...)                         |
|  - Motor de Reglas FIDE (chess.js / validador nativo)       |
|  - Gestor de Relojes y Turnos (Servidor como autoridad)     |
|  - Gateway WebSocket (Eventos de partida)                   |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
|                Capa de Persistencia (Base de Datos)         |
|  - Tablas / Colecciones: Players, Games, Moves, Clocks      |
|  - Historial PGN, Estados FEN, Auditoría de Tiempos         |
+-------------------------------------------------------------+
```

---

## 2. Modelo de Datos y Esquema de Base de Datos

### 2.1. Entidades Principales

1. **`players`**:
   - `id` (UUID / VARCHAR(36), PK)
   - `username` (VARCHAR(50), UNIQUE)
   - `email` (VARCHAR(100), UNIQUE, Nullable para invitados)
   - `rating` (INTEGER, Default: 1200)
   - `games_played` (INTEGER, Default: 0)
   - `games_won` (INTEGER, Default: 0)
   - `games_lost` (INTEGER, Default: 0)
   - `games_drawn` (INTEGER, Default: 0)
   - `created_at` (TIMESTAMP)

2. **`games`**:
   - `id` (UUID / VARCHAR(36), PK)
   - `white_player_id` (UUID, FK -> players.id, Nullable si está en espera)
   - `black_player_id` (UUID, FK -> players.id, Nullable si está en espera)
   - `mode` (VARCHAR(20)): `'async'` (por turnos) o `'timed'` (reloj en tiempo real)
   - `time_base_seconds` (INTEGER): Tiempo inicial total (ej. 300 para 5 min, 0 para asíncrono puro)
   - `time_increment_seconds` (INTEGER): Incremento por jugada (ej. 2 para Blitz 3+2, 0 si no hay)
   - `turn` (VARCHAR(5)): `'white'` o `'black'`
   - `turn_count` (INTEGER): Número de turno actual (inicia en 1)
   - `fen` (VARCHAR(120)): Posición actual FEN (Inicia: `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1`)
   - `pgn` (TEXT): Registro acumulado de movimientos en formato PGN
   - `status` (VARCHAR(30)): `'WAITING_FOR_PLAYER'`, `'IN_PROGRESS'`, `'CHECKMATE'`, `'STALEMATE'`, `'DRAW'`, `'TIMEOUT'`, `'RESIGNED'`, `'ABANDONED'`
   - `winner` (VARCHAR(5), Nullable): `'white'`, `'black'` o `'draw'`
   - `last_move_at` (TIMESTAMP): Momento exacto de la última jugada realizada
   - `created_at` (TIMESTAMP)
   - `updated_at` (TIMESTAMP)

3. **`game_clocks`**:
   - `game_id` (UUID, FK -> games.id, PK)
   - `white_time_remaining_ms` (INTEGER): Milisegundos restantes para blancas
   - `black_time_remaining_ms` (INTEGER): Milisegundos restantes para negras
   - `turn_started_at` (TIMESTAMP): Marca temporal cuando inició el turno actual

4. **`game_moves`**:
   - `id` (BIGINT AUTO_INCREMENT, PK)
   - `game_id` (UUID, FK -> games.id)
   - `move_number` (INTEGER): Número secuencial de la jugada
   - `side` (VARCHAR(5)): `'white'` o `'black'`
   - `from_square` (VARCHAR(2)): Casilla origen (ej. `'e2'`, `'c2'`, `'b1'`)
   - `to_square` (VARCHAR(2)): Casilla destino (ej. `'e4'`, `'c4'`, `'c3'`)
   - `piece` (VARCHAR(10)): `'pawn'`, `'horse'`, `'tower'`, `'bishop'`, `'queen'`, `'king'`
   - `san` (VARCHAR(15)): Notación clásica (ej. `'e4'`, `'Nc3'`, `'Bxf7+'`, `'O-O'`)
   - `uci` (VARCHAR(6)): Notación UCI (ej. `'e2e4'`, `'b1c3'`)
   - `captured_piece` (VARCHAR(10), Nullable): Pieza capturada si hubo
   - `fen_after` (VARCHAR(120)): FEN resultante tras aplicar este movimiento
   - `time_spent_ms` (INTEGER): Milisegundos que tardó el jugador en emitir la jugada
   - `created_at` (TIMESTAMP)

---

## 3. Especificación de Endpoints REST

- **Base URL:** `http://localhost:5000/api` (o `/api/v1`)
- **Cabeceras estándar:**
  - `Content-Type: application/json`
  - `Authorization: Bearer <session_token>` o `x-auth-token: <session_token>` (Identificación de usuario autenticado)
  - `X-Player-ID: <uuid>` (Identificador opcional de sesión invitado)

---

### 3.1. Módulo de Autenticación y Cuentas (`/api/auth`)

#### `POST /api/auth/register`
Registra un nuevo usuario en la plataforma con contraseña encriptada mediante PBKDF2 y salt criptográfico de 16 bytes.

- **Request Body:**
  ```json
  {
    "username": "roberto",
    "name": "Roberto Gómez",
    "email": "roberto@example.com",
    "password": "miPasswordSeguro123"
  }
  ```
- **Response 201 Created:**
  ```json
  {
    "success": true,
    "token": "a1b2c3d4e5f6...session_token...",
    "user": {
      "id": "user-1789345210",
      "username": "roberto",
      "name": "Roberto Gómez",
      "email": "roberto@example.com",
      "rating": 1200,
      "games_played": 0,
      "games_won": 0,
      "games_lost": 0,
      "games_drawn": 0,
      "created_at": "2026-09-13T20:00:00.000Z"
    }
  }
  ```

#### `POST /api/auth/login`
Autentica las credenciales del usuario comparando el hash PBKDF2 calculado contra el salt almacenado.

- **Request Body:**
  ```json
  {
    "username": "carlos",
    "password": "chess"
  }
  ```
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "token": "9f8e7d6c5b4a...",
    "user": {
      "id": "carlos",
      "username": "carlos",
      "name": "Carlos Ajedrecista",
      "rating": 1220,
      "games_played": 2,
      "games_won": 2,
      "games_lost": 0,
      "games_drawn": 0
    }
  }
  ```

#### `GET /api/auth/me`
Verifica la validez del token de sesión actual y retorna el perfil fresco del usuario.

- **Cabeceras:** `Authorization: Bearer <token>`
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "user": {
      "id": "carlos",
      "username": "carlos",
      "name": "Carlos Ajedrecista",
      "rating": 1220
    }
  }
  ```

#### `POST /api/auth/logout`
Invalida y destruye el token de sesión activo en el servidor.

- **Cabeceras:** `Authorization: Bearer <token>`
- **Response 200 OK:**
  ```json
  {
    "success": true,
    "message": "Sesión cerrada correctamente"
  }
  ```

---

### 3.2. Módulo de Usuarios y Consulta de Partidas (`/api/users`)

#### `GET /api/users`
Lista todos los usuarios registrados en el sistema con sus métricas Elo y conteos de victorias/derrotas.

- **Response 200 OK:**
  ```json
  {
    "success": true,
    "users": [
      { "id": "carlos", "username": "carlos", "name": "Carlos Ajedrecista", "rating": 1220, "games_played": 2 },
      { "id": "ana", "username": "ana", "name": "Ana Gran Maestra", "rating": 1350, "games_played": 5 }
    ]
  }
  ```

#### `GET /api/users/:id`
Retorna el perfil público detallado de un usuario en particular.

- **Response 200 OK:**
  ```json
  {
    "success": true,
    "user": {
      "id": "carlos",
      "username": "carlos",
      "name": "Carlos Ajedrecista",
      "rating": 1220,
      "games_played": 2,
      "games_won": 2,
      "games_lost": 0,
      "games_drawn": 0
    }
  }
  ```

#### `GET /api/users/:id/games` (o `GET /api/my-games`)
Consulta todas las partidas asociadas al usuario especificado (o al usuario autenticado en `/api/my-games`), calculando el resultado relativo (`WIN`, `LOSS`, `DRAW`, `IN_PROGRESS`), el bando ocupado y el oponente.

- **Response 200 OK:**
  ```json
  {
    "success": true,
    "user": {
      "id": "carlos",
      "name": "Carlos Ajedrecista",
      "rating": 1220
    },
    "stats": {
      "total": 2,
      "wins": 2,
      "losses": 0,
      "draws": 0,
      "in_progress": 0,
      "win_rate": 100
    },
    "games": [
      {
        "id": "test-carlos-win-1789345210",
        "date": "2026-09-13T21:18:29.000Z",
        "user_side": "white",
        "opponent": "Ana Gran Maestra",
        "status": "CHECKMATE",
        "winner": "white",
        "result": "WIN",
        "moves_count": 7,
        "is_game_over": true
      }
    ]
  }
  ```

---

### 3.3. Módulo Partidas (`/games`)

#### `POST /games`

Crea una nueva partida de ajedrez.

- **Request Body (Partida Asíncrona):**

  ```json
  {
    "mode": "async",
    "player_side": "white",
    "async_turn_limit_hours": 24
  }
  ```

- **Request Body (Partida con Reloj):**

  ```json
  {
    "mode": "timed",
    "player_side": "white",
    "time_base_seconds": 300,
    "time_increment_seconds": 2
  }
  ```

- **Response 201 Created:**

  ```json
  {
    "success": true,
    "data": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "WAITING_FOR_PLAYER",
      "mode": "timed",
      "white_player": {
        "id": "a9b8c7d6-e5f4-4321-abcd-0123456789ab",
        "username": "kasparov_fan"
      },
      "black_player": null,
      "turn": "white",
      "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "clocks": {
        "white_time_remaining_ms": 300000,
        "black_time_remaining_ms": 300000
      },
      "created_at": "2026-09-13T19:42:00.000Z"
    }
  }
  ```

#### `POST /games/:id/join`

Un segundo jugador se une a una partida en espera.

- **Response 200 OK:**

  ```json
  {
    "success": true,
    "data": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "IN_PROGRESS",
      "white_player": { "id": "a9b8c7d6-...", "username": "kasparov_fan" },
      "black_player": { "id": "c1d2e3f4-...", "username": "karpov_rival" },
      "turn": "white",
      "turn_started_at": "2026-09-13T19:43:00.000Z"
    }
  }
  ```

#### `GET /games/:id`

Consulta el estado completo de la partida, posición de piezas y tiempos actuales.

- **Response 200 OK:**

  ```json
  {
    "success": true,
    "data": {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "status": "IN_PROGRESS",
      "mode": "timed",
      "turn": "white",
      "turn_count": 5,
      "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
      "in_check": false,
      "clocks": {
        "white_time_remaining_ms": 284000,
        "black_time_remaining_ms": 291000,
        "is_running": true,
        "active_side": "white"
      },
      "captured_pieces": {
        "white": [],
        "black": []
      },
      "material_points": {
        "white": 39,
        "black": 39
      },
      "winner": "white",
      "in_check": false
    }
  }
  ```

#### `GET /api/games/:id/history/:step`

Reconstruye la posición exacta del tablero en el turno `step` (0 para posición inicial, N para la jugada N) en modo de solo lectura.

- **Parámetros de ruta:**
  - `id`: Identificador de la partida.
  - `step`: Número de jugada a reconstruir (entero `>= 0`).
- **Respuesta 200 OK:**
  ```json
  {
    "success": true,
    "data": {
      "step": 4,
      "total_moves": 37,
      "is_historical": true,
      "current_move": { "turn_number": 4, "side": "black", "san": "Qh4#", "from": "d8", "to": "h4" },
      "board": { "a1": null, "e8": { "name": "king", "side": "black" } },
      "active_pieces": [ { "id": "kb", "name": "king", "side": "black", "square": "e8" } ]
    }
  }
  ```

#### `GET /api/bot/levels`

Retorna el catálogo técnico de los 10 niveles de dificultad disponibles para el robot (IA).

- **Respuesta 200 OK:**
  ```json
  {
    "success": true,
    "data": {
      "1": { "name": "Nivel 1: Novato (Iniciación)", "depth": 1, "blunderChance": 0.6, "description": "Alta tasa de errores (60%)." },
      "5": { "name": "Nivel 5: Club Intermedio", "depth": 2, "blunderChance": 0.05, "description": "Pocos errores y desarrollo armónico." },
      "10": { "name": "Nivel 10: Gran Maestro (Máximo)", "depth": 3, "blunderChance": 0.0, "description": "Máxima potencia con MVV-LVA y Quiescence." }
    }
  }
  ```

#### `POST /api/games/:id/bot-move`

Solicita a la Inteligencia Artificial que calcule y ejecute la mejor jugada para el turno actual de la partida.

- **Request Body:**
  ```json
  {
    "difficulty": 10
  }
  ```
- **Respuesta 200 OK:**
  ```json
  {
    "success": true,
    "data": {
      "bot_difficulty": 10,
      "bot_level_name": "Nivel 10: Gran Maestro (Máximo)",
      "applied_move": { "turn_number": 2, "side": "black", "san": "Nc6", "from": "b8", "to": "c6" },
      "game": { "id": "game-1", "status": "IN_PROGRESS", "turn": "white" }
    }
  }
  ```


---

### 3.3. Módulo Movimientos y Comandos Clásicos (`/games/:id/moves`)

#### `POST /games/:id/moves`

Envía y ejecuta un movimiento de ajedrez. Acepta tanto notación de coordenadas clásicas (`c2` a `c4`, `b1` a `c3`) como notación UCI (`c2c4`, `b1c3`) o Notación SAN (`Nf3`, `Cc3`).

- **Variante A: Coordenadas directas (compatibles con Flexbox Chess):**

  ```json
  {
    "from": "b1",
    "to": "c3",
    "promotion": null
  }
  ```

- **Variante B: Notación UCI clásica:**

  ```json
  {
    "uci": "b1c3"
  }
  ```

- **Variante C: Notación Algebraica Clásica (SAN / Español o Inglés):**

  ```json
  {
    "san": "Cc3"
  }
  ```

- **Respuesta Exitosa 200 OK:**

  ```json
  {
    "success": true,
    "data": {
      "move_number": 3,
      "side": "white",
      "san": "Nc3",
      "uci": "b1c3",
      "from": "b1",
      "to": "c3",
      "piece": "horse",
      "captured": null,
      "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 3 3",
      "next_turn": "black",
      "is_check": false,
      "is_checkmate": false,
      "is_stalemate": false,
      "clocks": {
        "white_time_remaining_ms": 282000,
        "black_time_remaining_ms": 291000
      }
    }
  }
  ```

- **Respuesta de Error por Movimiento Ilegal 422 Unprocessable Entity:**

  ```json
  {
    "success": false,
    "error": {
      "code": "ILLEGAL_MOVE",
      "message": "El caballo en b1 no puede alcanzar la casilla e5 en este turno",
      "details": {
        "attempted_move": "b1e5",
        "legal_moves_from_b1": ["a3", "c3"]
      }
    }
  }
  ```

---

## 4. Protocolo en Tiempo Real (WebSockets / Socket.IO)

Para partidas con reloj o actualización instantánea de movimientos, la API expone un servidor WebSocket en la ruta `/socket.io/`.

### 4.1. Eventos Enviados por el Cliente

- **`join_game`**:

  ```json
  {
    "game_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "player_id": "a9b8c7d6-e5f4-4321-abcd-0123456789ab"
  }
  ```

- **`make_move`**:

  ```json
  {
    "game_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "from": "b1",
    "to": "c3"
  }
  ```

### 4.2. Eventos Emitidos por el Servidor

- **`game:started`**: Emitido a ambos jugadores cuando el segundo jugador se une.
- **`game:move_applied`**: Difundido a ambos clientes con el nuevo estado del tablero, casilla origen, casilla destino y pieza movida.
- **`game:clock_sync`**: Emitido periódicamente (cada 1s) o tras cada jugada para mantener sincronizados los relojes de ambos jugadores con el servidor.
- **`game:game_over`**: Emitido cuando la partida concluye:

  ```json
  {
    "result": "CHECKMATE",
    "winner": "white",
    "reason": "Las negras están en jaque mate"
  }
  ```

---

## 5. Algoritmo del Reloj en Servidor

Para garantizar justicia deportiva e impedir manipulación local:

1. **Al iniciar el turno:**
   `turn_started_at = NOW()`
2. **Al recibir un movimiento válido:**

   ```text
   elapsed_ms = NOW() - turn_started_at
   remaining_ms = player_time_remaining_ms - elapsed_ms + (increment_seconds * 1000)
   ```

3. **Validación de caída de bandera (_Flag Fall_):**
   Si `remaining_ms <= 0`, la jugada no se aplica y se declara automáticamente derrota por tiempo:

   ```json
   {
     "status": "TIMEOUT",
     "winner": "opposite_side"
   }
   ```

4. **Partidas Asíncronas:**
   En partidas asíncronas no se descuenta tiempo por segundo; en su lugar se evalúa:
   `NOW() - last_move_at > max_hours_allowed`.
