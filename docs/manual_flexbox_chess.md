# Manual de Usuario y Desarrollador: Flexbox Chess

Este documento proporciona una guía exhaustiva sobre la arquitectura, funcionamiento, estructura de datos y ejecución del proyecto existente **Flexbox Chess**, sirviendo como base operativa para su posterior integración con la nueva API de backend.

---

## 1. Descripción General del Proyecto

**Flexbox Chess** es una aplicación web interactiva que renderiza un tablero de ajedrez funcional utilizando **CSS Flexible Box Layout (Flexbox)**, manipulación del Document Object Model (DOM) con **jQuery 1.12.0** y eventos nativos de **HTML5 Drag and Drop**.

El juego permite:

- Despliegue visual de un tablero 8x8 con piezas negras y blancas.
- Movimiento de piezas mediante arrastrar y soltar (_drag & drop_).
- Validación preliminar de movimientos según tipo de pieza y trayectoria.
- Captura de piezas rivales y cálculo de puntaje por material.
- Registro visual de turnos, movimientos y relojes básicos.

---

## 2. Estructura de Archivos del Proyecto

```text
flexbox_chess/
│
├── .env                       # Variables de entorno (puerto, host)
├── .gitignore                 # Exclusiones de control de versiones
├── package.json               # Configuración npm y scripts de arranque
├── server.js                  # Servidor HTTP nativo en Node.js
├── README.md                  # Descripción inicial del repositorio
│
├── app/                       # Aplicación Frontend
│   ├── .attachments/          # Recursos gráficos (favicon, capturas)
│   ├── css/
│   │   ├── index.css          # Estilos visuales del tablero y piezas
│   │   └── index.min.css      # Versión minificada de estilos
│   ├── js/
│   │   ├── jquery-1.12.0.min.js # Biblioteca jQuery
│   │   ├── index.js           # Inicialización y renderizado del tablero
│   │   ├── index.min.js       # Versión minificada de index.js
│   │   ├── chess-rules.js     # Motor de reglas y validación de jugadas
│   │   └── chess-rules.min.js # Versión minificada de chess-rules.js
│   ├── index.html             # Página principal del juego
│   └── index.min.html         # Versión minificada de la página principal
│
└── data/
    └── initial.json           # Definición del estado inicial del tablero y piezas
```

---

## 3. Instrucciones de Instalación y Ejecución

### Requisitos Previos

- **Node.js** (versión 14.x o superior recomendada).
- Navegador web moderno con soporte para Drag & Drop (Google Chrome, Mozilla Firefox, Microsoft Edge, Safari).

### Ejecución Local

1. **Iniciar el Servidor HTTP integrado:**
   En la raíz del proyecto, ejecute:

   ```bash
   npm start
   ```

   o alternativamente con Node directamente:

   ```bash
   node server.js
   ```

   Por defecto, el servidor se iniciará en:

   ```text
   http://127.0.0.1:5000
   ```

2. **Personalizar Host y Puerto:**
   Se pueden especificar variables de entorno antes de lanzar el proceso:

   ```bash
   # En Windows PowerShell
   $env:PORT=4001; $env:HOST="127.0.0.1"; node server.js

   # En Linux / macOS
   HOST=127.0.0.1 PORT=4001 node server.js
   ```

3. **Acceder a la Aplicación:**
   Abra un navegador y navegue a `http://localhost:5000/`. El servidor redirige automáticamente la ruta `/` hacia `app/index.html`.

---

## 4. Arquitectura y Funcionamiento Interno

### 4.1. Carga e Inicialización (`app/js/index.js`)

1. **Ciclo de arranque:**
   - La función `load()` es llamada al cargar la página.
   - Realiza una petición `fetch("/data/initial.json")`.
   - Muestra el cartel flotante `"Start"` a través de `messageShow("Start")`.

2. **Construcción dinámica del tablero (`loadGame`):**
   - El tablero se genera mediante columnas Flexbox (`div.col`) identificadas con las letras de la `a` a la `h`.
   - Cada columna contiene 8 celdas (`div.cell`), identificadas mediante una combinación de letra y número (ej. `a1`, `a2`, ..., `h8`).
   - Las clases `white` y `black` de las celdas se asignan alternadamente usando el operador módulo `(i + j) % 2`.
   - Cada celda contiene los atributos `col` (1 a 8), `row` (1 a 8), `ondrop="drop(event)"` y `ondragover="allowDrop(event)"`.

3. **Posicionamiento de Piezas:**
   - Itera sobre el arreglo `data.army_members` de `initial.json`.
   - Crea un elemento HTML `<icon>` para cada pieza con los atributos:
     - `id`: Identificador único (ej. `kw`, `qw`, `tw1`, `hw1`, `pw1`).
     - `name`: Nombre en inglés (`king`, `queen`, `tower`, `bishop`, `horse`, `pawn`).
     - `side`: Bando (`white` o `black`).
     - `symbol`: Carácter Unicode de la pieza (♚, ♛, ♜, ♝, ♞, ♟).
     - `points`: Valor material de la pieza (Peón: 1, Caballo/Alfil: 3, Torre: 5, Dama: 9, Rey: 34).
     - `draggable="true"` y `ondragstart="drag(event)"`.

### 4.2. Drag & Drop y Motor de Reglas (`app/js/chess-rules.js`)

1. **Inicio del Arrastre (`drag`):**
   - Valida que la pieza arrastrada coincida con el bando que tiene el turno activo (`data.side`).
   - Si es válido, almacena el `id` de la pieza en el canal de transferencia (`ev.dataTransfer.setData("id", ...)`).

2. **Soltar la Pieza (`drop`):**
   - Obtiene la pieza de origen y la casilla destino (`target`).
   - Construye un objeto `movement` con:
     - Coordenadas de origen (`initial: { col, row }`) y destino (`final: { col, row }`).
     - Diferenciales de desplazamiento (`diffs: { cols, rows }`).
     - Fecha y hora formateada en locale `es-CO`.
   - **Detección de Captura (`validateCaptured`):**
     - Si la celda de destino ya contiene una pieza enemiga, se marca como capturada, se retira del DOM y se suman los puntos de material al marcador correspondiente (`#white_points` o `#black_points`).
   - **Validación de Movimientos (`validateMovement`):**
     - **Rey (`king`):** Desplazamiento máximo de 1 casilla en cualquier dirección.
     - **Dama (`queen`):** Desplazamiento ortogonal o diagonal + validación de casilla despejada en la trayectoria (`validateTrayectory`).
     - **Torre (`tower`):** Desplazamiento ortogonal en línea recta + validación de trayectoria.
     - **Alfil (`bishop`):** Desplazamiento en diagonal estricta (`|Δcol| == |Δrow|`) + validación de trayectoria.
     - **Caballo (`horse`):** Patrón en "L" (`(Δcol==1 && Δrow==2) || (Δcol==2 && Δrow==1)`). Salta piezas intermedias.
     - **Peón (`pawn`):** Avance simple (o doble en primer movimiento) hacia adelante según el color (`factor = 1` para blancas, `-1` para negras), y avance diagonal condicionado a captura.
   - **Finalización del Movimiento:**
     - Agrega la jugada al historial (`history.push(movement)`).
     - Actualiza la tabla visual de movimientos (`addToMovementsTable`).
     - Cambia el turno (`changeTurn()`) alternando entre `white` y `black`.
     - Inicia o actualiza el temporizador del bando activo (`startClock(data)`).

### 4.3. Control de Tiempo Actual

- Se cuenta el tiempo acumulado en segundos para cada bando (`whiteTime` y `blackTime`).
- Un `setInterval` de 1000ms incrementa el contador del jugador que posee el turno activo.
- La función `formatTime(seconds)` convierte los segundos al formato `hh:mm:ss` para mostrarse en `#white-clock` y `#black-clock`.

---

## 5. Diagnóstico de Limitaciones del Motor Actual

Para que el frontend pueda competir y funcionar con la robustez requerida por un sistema de ajedrez formal, se identifican las siguientes áreas de oportunidad que la nueva API resolverá:

| Característica                       | Estado Actual en Frontend                                                                                   | Solución con la Nueva API                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Enroque (Castling)**               | No implementado (rey y torre mueven individualmente).                                                       | Validación y ejecución formal de `O-O` y `O-O-O`.                          |
| **Captura al Paso (_En Passant_)**   | No implementada.                                                                                            | Registro del peón vulnerable en el estado FEN y backend.                   |
| **Coronación / Promoción de Peones** | No implementada (el peón se queda en fila 8/1 sin transformarse).                                           | Solicitud de pieza promovida (`Q`, `R`, `B`, `N`) al alcanzar el extremo.  |
| **Detección de Jaque y Jaque Mate**  | No detecta si el rey queda amenazado ni fin de juego.                                                       | Motor de ajedrez en servidor con validación estricta de jaque/mate/tablas. |
| **Partidas Asíncronas**              | No existe sincronización remota; solo funciona en el mismo navegador.                                       | Persistencia en base de datos, turnos remotos y consultas REST.            |
| **Partidas con Reloj Formal**        | El reloj cuenta hacia arriba (tiempo transcurrido) en vez de cuenta regresiva (_countdown_ con incremento). | Control de tiempo del servidor con derrota por tiempo (_flag fall_).       |

---

## 6. Mapeo de Identificadores y Notación Clásica

El proyecto usa internamente nombres singulares en inglés y español. A continuación se detalla su correspondencia con la notación estándar:

| Pieza   | ID en `initial.json`        | Nombre en `army_members` | Notación SAN (Español) | Notación SAN (Inglés) |
| ------- | --------------------------- | ------------------------ | ---------------------- | --------------------- |
| Rey     | `kw` / `kb`                 | `king`                   | **R**                  | **K**                 |
| Dama    | `qw` / `qb`                 | `queen`                  | **D**                  | **Q**                 |
| Torre   | `tw1`, `tw2` / `tb1`, `tb2` | `tower`                  | **T**                  | **R**                 |
| Alfil   | `bw1`, `bw2` / `bb1`, `bb2` | `bishop`                 | **A**                  | **B**                 |
| Caballo | `hw1`, `hw2` / `hb1`, `hb2` | `horse`                  | **C**                  | **N**                 |
| Peón    | `pw1`..`pw8` / `pb1`..`pb8` | `pawn`                   | _(sin letra)_          | _(sin letra)_         |

Este mapeo es fundamental para que la nueva API reciba comandos de casillas (ej. `b1c3`, `c2c4`) o jugadas clásicas (`Cc3` / `Nc3`) y las traduzca con precisión.

---

## 7. Funcionalidades Modernas Integradas

Tras la evolución del sistema, la aplicación cuenta con:
1. **Servidor Backend y Persistencia:** `server.js` gestiona partidas con reglas formales de ajedrez y persistencia en disco en `data/games/<id>.json`.
2. **Sincronización Multi-Sesión en Tiempo Real:** Bucle asíncrono cada 1200ms que permite partidas entre distintos navegadores o jugadores remotos mediante el parámetro de URL `?game=<id>`.
3. **Robot de Inteligencia Artificial (10 Niveles):** Motor Minimax con Poda Alfa-Beta, ordenamiento de jugadas MVV-LVA, búsqueda de tranquilidad (*Quiescence*) y control central, cubriendo desde el Nivel 1 (Novato) hasta el Nivel 10 (Gran Maestro).
4. **Detección Oficial de Jaque Mate y Fin de Partida:** Detección de jaque (`in_check`), jaque mate (`CHECKMATE`), tablas (`STALEMATE`) y proclamación visual del ganador con detención de relojes y bloqueo físico de arrastre de piezas.
5. **Paginación Descendente de la Tabla de Movimientos:** Presentación compacta de 10 en 10 jugadas con orden descendente (las jugadas más recientes en la primera página).
6. **Navegación Histórica en Modo Solo Lectura:** Controles `|◀`, `◀`, `▶`, `▶|` y selección de filas de la tabla para inspeccionar jugadas pasadas sin riesgo de modificar la partida en vivo.

