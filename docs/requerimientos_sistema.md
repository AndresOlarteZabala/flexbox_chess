# Especificación de Requerimientos del Sistema (SRS): API de Ajedrez Persistente

## 1. Introducción y Objetivos

El presente documento define los requerimientos funcionales y no funcionales para la **API de Ajedrez**, cuyo propósito es proporcionar un backend robusto, escalable y confiable para gestionar partidas de ajedrez, persistir jugadores, registrar estados de juego, validar jugadas mediante notación clásica y gestionar tanto partidas en tiempo real con control de reloj como partidas asíncronas de larga duración (ajedrez por correspondencia).

Esta API está diseñada para acoplarse con clientes web y móviles, comenzando por la interfaz gráfica existente **Flexbox Chess**.

---

## 2. Actores del Sistema

| Actor                                     | Descripción                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Jugador (Player)**                      | Usuario registrado o invitado que crea, se une y disputa partidas con piezas blancas o negras.                                                               |
| **Espectador (Spectator)**                | Usuario que consulta el estado y movimientos de una partida en curso sin emitir jugadas.                                                                     |
| **Árbitro del Sistema (System / Engine)** | Componente de backend que valida la legalidad de los movimientos, aplica las reglas FIDE, descuenta el tiempo de los relojes y declara el fin de la partida. |
| **Administrador (Admin)**                 | Usuario con privilegios para consultar métricas, partidas archivadas y gestionar jugadores.                                                                  |

---

## 3. Requerimientos Funcionales (RF)

### 3.1. Gestión de Jugadores

- **RF-01: Registro y Creación de Jugadores**
  - El sistema debe permitir registrar jugadores proporcionando un nombre de usuario único (`username`), correo electrónico y contraseña, o permitir la creación de jugadores invitados/temporales (_guest players_).
- **RF-02: Perfil y Estadísticas**
  - El sistema debe mantener y persistir las estadísticas acumuladas de cada jugador:
    - Partidas totales jugadas.
    - Partidas ganadas (por jaque mate, por tiempo o por rendición).
    - Partidas perdidas.
    - Partidas empatadas (tablas).
    - Puntuación de rating estimada (sistema ELO o Glicko-2).
- **RF-03: Historial de Partidas del Jugador**
  - El sistema debe permitir consultar la lista de partidas activas e históricas asociadas a un jugador, con filtros por estado (`active`, `completed`, `abandoned`).

---

### 3.2. Gestión y Persistencia de Partidas

- **RF-04: Creación de Partidas**
  - Un jugador debe poder crear una partida especificando:
    - Color deseado: `white`, `black` o `random`.
    - Modalidad de tiempo: `asynchronous` (por turnos) o `timed` (con reloj en tiempo real).
    - Configuración de tiempo (si aplica): tiempo base en minutos/segundos e incremento por jugada.
    - Visibilidad: pública o privada (mediante código de invitación).
- **RF-05: Unión a Partidas (_Matchmaking_ / Retos)**
  - Un segundo jugador debe poder unirse a una partida en estado `WAITING_FOR_PLAYER`. Una vez completados los dos jugadores, la partida pasa inmediatamente a estado `IN_PROGRESS` y el reloj de las blancas se activa.
- **RF-06: Persistencia Integral del Estado de Juego**
  - Cada partida debe persistir en base de datos:
    - Identificador único (`UUID`).
    - Identificadores de los jugadores de piezas blancas y negras.
    - Estado actual del tablero en formato estándar **FEN** (_Forsyth-Edwards Notation_).
    - Registro histórico de jugadas en formato **PGN** (_Portable Game Notation_).
    - Lista secuencial de movimientos con: número de jugada, bando, casilla origen, casilla destino, pieza, captura, tiempo transcurrido y timestamp ISO 8601.
    - Puntos de material capturado por cada bando.
    - Estado de la partida: `WAITING_FOR_PLAYER`, `IN_PROGRESS`, `PAUSED`, `CHECKMATE`, `STALEMATE`, `DRAW_AGREEMENT`, `TIMEOUT`, `RESIGNED`, `ABANDONED`.
- **RF-07: Recuperación y Continuación de Partidas**
  - El sistema debe permitir que cualquier jugador reanude una partida en cualquier momento consultando el endpoint del juego (`GET /api/v1/games/:id`), devolviendo el estado exacto del tablero, turno y tiempos restantes.

---

### 3.3. Procesamiento y Validación de Comandos de Ajedrez

- **RF-08: Notación Clásica de Ajedrez y Coordenadas**
  - La API debe aceptar movimientos expresados en:
    1. **Notación de Coordenadas / UCI:** Por ejemplo, `e2e4`, `b1c3`, `g8f6`, `c2c4`.
    2. **Notación Algebraica Estándar (SAN):** Por ejemplo, `e4`, `Nc3` / `Cc3` (caballo), `Bxf7+` / `Axf7+` (alfil capturando), `O-O` (enroque corto), `O-O-O` (enroque largo).
    3. **Payload estructurado:** Objeto JSON con `{ from: "c2", to: "c4", promotion: "q" }`.
- **RF-09: Validación Estricta de Reglas de Ajedrez (FIDE)**
  - El backend debe validar que toda jugada emitida cumpla las reglas oficiales:
    - Movimientos legales de cada pieza (peón, caballo, alfil, torre, dama, rey).
    - Imposibilidad de mover piezas a través de casillas ocupadas (excepto caballo).
    - Prohibición de dejar al propio rey en posición de jaque.
    - Validación de enroque (verificar que rey y torre no se hayan movido, casillas libres y que el rey no pase por jaque).
    - Validación de captura al paso (_en passant_).
    - Validación de coronación (_pawn promotion_) a dama, torre, alfil o caballo.
- **RF-10: Respuesta de Movimiento Inválido**
  - Si una jugada es ilegal, la API debe rechazar la solicitud con código HTTP `400 Bad Request` o `422 Unprocessable Entity`, detallando la causa exacta (ej. `"Casilla de origen vacía"`, `"No es el turno de este jugador"`, `"El rey quedaría en jaque"`).
- **RF-11: Detección Automática de Fin de Partida**
  - Tras cada movimiento válido, el motor de la API debe evaluar:
    - **Jaque Mate:** El rey del oponente está en jaque y no tiene movimientos legales posibles.
    - **Rey Ahogado (_Stalemate_):** El jugador en turno no está en jaque pero no tiene jugadas legales.
    - **Material Insuficiente:** Rey contra rey, rey y caballo contra rey, rey y alfil contra rey, etc.
    - **Regla de los 50 movimientos:** 50 jugadas consecutivas sin avances de peón ni capturas.
    - **Triple repetición:** Misma posición del tablero repetida 3 veces con los mismos derechos de enroque y paso.

---

### 3.4. Modalidades de Juego y Control de Tiempo

- **RF-12: Modalidad Asíncrona (Partidas de Larga Duración / Correspondencia)**
  - Diseñada para partidas que pueden durar horas, días o semanas.
  - El sistema debe soportar un tiempo máximo por movimiento configurable (ej. 24 horas, 48 horas, 7 días o sin límite).
  - Los jugadores no requieren mantener una conexión WebSocket abierta permanentemente.
  - Se debe registrar el tiempo que tomó cada movimiento de forma auditable.
  - Si un jugador excede el plazo asignado para su turno en modo asíncrono, la partida puede ser declarada automáticamente como perdida por abandono/tiempo.
- **RF-13: Modalidad con Tiempo (Reloj en Tiempo Real)**
  - Soporte para controles de tiempo estándar:
    - **Bullet:** 1 min + 0 seg / 2 min + 1 seg.
    - **Blitz:** 3 min + 2 seg / 5 min + 0 seg / 5 min + 3 seg.
    - **Rápido:** 10 min + 0 seg / 15 min + 10 seg.
    - **Clásico:** 30 min, 60 min, 90 min + 30 seg.
  - Tipos de incremento:
    - **Fischer:** Se añade el incremento fijado a la cuenta del jugador inmediatamente después de ejecutar un movimiento válido.
    - **Bronstein / Delay:** El tiempo consumido en la jugada hasta el valor del retardo no descuenta del reloj principal.
- **RF-14: Autoridad del Reloj en el Servidor**
  - El cálculo del tiempo restante de cada jugador debe realizarse **exclusivamente en el backend** mediante diferencias de timestamps (`now - turn_started_at`) para evitar adulteración desde la consola del navegador.
  - Caída de bandera (_Flag fall_): Si el tiempo del jugador llega a 0, el servidor finaliza la partida por tiempo inmediatamente (`TIMEOUT`), declarando ganador al oponente (salvo si este último tiene material insuficiente para dar mate, en cuyo caso es tablas).

---

### 3.5. Acciones de Juego Adicionales

- **RF-15: Rendición (_Resign_)**
  - Cualquier jugador puede rendirse en su turno o en el del oponente (`POST /api/v1/games/:id/resign`).
- **RF-16: Oferta y Aceptación de Tablas (_Draw_)**
  - Un jugador puede ofrecer tablas al realizar su jugada o durante su turno. El oponente puede aceptar o rechazar la oferta.
- **RF-17: Cancelación y Abandono**
  - Una partida en espera puede ser cancelada por su creador. Si un jugador abandona deliberadamente una partida en progreso, se adjudica la victoria al rival.

---

## 4. Requerimientos No Funcionales (RNF)

- **RNF-01: Rendimiento y Latencia**
  - El tiempo de respuesta para la validación y ejecución de un movimiento en la API debe ser menor a **100 ms** en el percentil 95 (P95).
- **RNF-02: Integridad y Consistencia de Datos (ACID)**
  - La ejecución de un movimiento, el descuento de reloj y la actualización del estado FEN deben realizarse de forma atómica dentro de una transacción de base de datos para prevenir condiciones de carrera (_race conditions_).
- **RNF-03: Tolerancia a Fallos y Reconexión**
  - Si un jugador en partida en tiempo real sufre una desconexión momentánea de red, el sistema debe permitirle reconectarse sin perder la partida, sincronizando el estado actual y el reloj remanente.
- **RNF-04: Seguridad y Autorización**
  - Un jugador solo puede ejecutar movimientos para el bando que le fue asignado (`white` o `black`).
  - Todas las entradas deben ser sanitizadas contra inyección SQL y validación estricta de esquemas de entrada.
- **RNF-05: Escalabilidad Horizontal**
  - La capa de API debe ser _stateless_ (sin estado en memoria local del proceso), delegando el estado persistente a la base de datos y/o un gestor de caché (Redis), permitiendo múltiples instancias de la API.
- **RNF-06: Compatibilidad con la Interfaz Gráfica (`flexbox_chess`)**
  - Las estructuras JSON de respuesta deben ser fácilmente consumibles por el código JavaScript existente, permitiendo mapear casillas (`c2`, `b1`, `a1`) con los elementos DOM sin requerir reescritura total del cliente.

---

## 5. Matriz de Trazabilidad de Requerimientos

| ID Requerimiento | Módulo                           | Prioridad | Modalidad de Partida |
| ---------------- | -------------------------------- | --------- | -------------------- |
| RF-01 a RF-03    | Jugadores y Perfiles             | Alta      | Ambas                |
| RF-04 a RF-07    | Ciclo de Vida y Persistencia     | Crítica   | Ambas                |
| RF-08 a RF-11    | Notación y Reglas de Ajedrez     | Crítica   | Ambas                |
| RF-12            | Modo Asíncrono / Correspondencia | Alta      | Asíncrono            |
| RF-13 a RF-14    | Modo con Reloj y Tiempo Real     | Alta      | Tiempo Real          |
| RF-15 a RF-17    | Acciones y Finalización          | Media     | Ambas                |
