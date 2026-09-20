# Flexbox Chess & Chess API Server

Plataforma interactiva de ajedrez en la web construida con **CSS Flexbox**, **JavaScript/jQuery** y respaldada por un servidor de reglas, persistencia e Inteligencia Artificial en **Node.js / Express**.

---

## 🌟 Características Principales

- **🎮 Tablero Interactivo con HTML5 Drag & Drop:** Movimiento fluido de piezas, cálculo de trayectorias y detección de capturas con puntajes de material acumulados.
- **🌐 Servidor Backend REST con Autoridad de Reglas (`server.js`):** Valida cada movimiento en el servidor, garantiza la legalidad de las jugadas e impide movimientos que dejen o mantengan al rey en jaque.
- **💾 Persistencia de Partidas en Tiempo Real:** Las partidas se identifican por ID único y se almacenan automáticamente en caché de memoria y en disco en [`data/games/<id>.json`](./data/games/).
- **👥 Modo Multi-Sesión / Multijugador Online:** Dos jugadores en navegadores, ventanas o pestañas diferentes pueden disputar la misma partida en vivo mediante el parámetro de URL `?game=<id>` con sincronización automática en bucle cada 1200ms.
- **🔐 Gestión de Usuarios y Autenticación Criptográfica:** Sistema de cuentas con contraseñas protegidas mediante **PBKDF2 nativo** (10,000 iteraciones, salt de 16 bytes y SHA-512), tokens de sesión Bearer persistentes en el cliente (`localStorage`) y cálculo de ranking Elo dinámico (+15/-10).
- **📋 Visor de Partidas por Usuario:** Modal interactivo para consultar partidas de cualquier jugador, estadísticas de rendimiento (Victorias, Derrotas, Tablas, Winrate) y botón para cargar inmediatamente cualquier partida previa en el tablero principal.
- **🤖 Robot IA con 10 Niveles de Dificultad Graduables:** Motor Minimax con Poda Alfa-Beta, ordenamiento de capturas (*Move Ordering MVV-LVA*), búsqueda de tranquilidad (*Quiescence Search*) y control central (`e4, d4, e5, d5`), cubriendo desde el Nivel 1 (Novato con 60% de error didáctico) hasta el Nivel 10 (Gran Maestro).
- **🏆 Reglas Oficiales FIDE Completas:** Enroque corto y largo con validación de casillas atacadas, coronación de peones a reina/torre/alfil/caballo, y las tres causas automáticas de tablas (insuficiencia de material, regla de 50 movimientos y triple repetición), además de detección de jaque (`in_check`), jaque mate (`CHECKMATE`), detención automática de relojes, anuncio formal del ganador y bloqueo total de interacción con las piezas al concluir la partida.
- **🔗 Multijugador Persistente y Enlaces Directos:** Rutas `/game/:id` para compartir o recargar una partida sin perderla, unión formal a partidas (`/api/games/:id/join`) y reclamo retroactivo de bando para invitados que inician sesión (`/api/games/:id/claim`). Las sesiones de usuario se persisten en disco (`data/users/sessions.json`) y sobreviven a reinicios del servidor.
- **💎 Nueva Interfaz Gráfica Cyber-Minimalist HUD (v2.0):** Experiencia visual futurista y elegante con diseño *Dark Glassmorphism*, tipografías Google `'Outfit'` y `'JetBrains Mono'`, piezas vectoriales SVG de alta definición (blancas perladas y negras en obsidiana con silueta cian), bisel con rieles perimetrales (1-8 y A-H), tarjetas HUD de telemetría para ambos jugadores con relojes LED de pulso activo, botón para invertir tablero (`flipBoard`), resaltado brillante de casillas y sintetizador procedural de audio nativo (Web Audio API).
- **🔒 Barra de Navegación Histórica en Modo Solo Lectura:** Controles paso a paso (`|◀`, `◀`, `▶`, `▶|`) y filas interactivas en la tabla para inspeccionar cualquier posición previa del tablero con garantía absoluta de inmutabilidad del juego activo.

---

## 🚀 Inicio Rápido

### Requisitos Previos

- **Node.js** (v16.x o superior recomendado).
- Navegador web moderno (Chrome, Edge, Firefox, Safari).

### Instalación y Ejecución

1. Clona el repositorio o accede a la carpeta raíz:

   ```bash
   cd flexbox_chess
   ```

2. Instala las dependencias del servidor:

   ```bash
   npm install
   ```

3. Inicia el servidor backend y la aplicación web:

   ```bash
   npm start
   # o alternativamente:
   node server.js
   ```

4. Abre tu navegador web en:

   ```text
   http://127.0.0.1:5000
   ```

   *(Usuarios demo pre-cargados: `carlos` / `chess` y `ana` / `chess`)*

---

## 📁 Estructura del Proyecto

```text
flexbox_chess/
│
├── api/                               # Capa de Lógica, Reglas, IA y Usuarios en Servidor
│   ├── chessEngine.js                 # Motor de reglas, jaque, jaque mate y notación SAN
│   ├── chessAI.js                     # Motor de IA: Minimax, Alfa-Beta, Quiescence (Niveles 1 a 10)
│   ├── userStore.js                   # Gestión de usuarios, hash PBKDF2, sesiones y partidas por usuario
│   └── gameStore.js                   # Persistencia dual (Memoria + Archivos JSON) y auto-actualización Elo
│
├── app/                               # Aplicación Web Frontend
│   ├── css/
│   │   └── index.css                  # Estilos del tablero Flexbox, modales de auth/partidas y componentes
│   ├── js/
│   │   ├── jquery-1.12.0.min.js       # Biblioteca jQuery
│   │   ├── index.js                   # Lógica cliente, bucle de sincronización, auth y visor de partidas
│   │   └── chess-rules.js             # Controladores de arrastre y soltado (Drag & Drop) con auth token
│   └── index.html                     # Interfaz web principal con barra de sesión y modales integrados
│
├── data/
│   ├── initial.json                   # Posición inicial de las piezas
│   ├── games/                         # Almacenamiento persistente de partidas activas e históricas
│   │   └── <game-id>.json
│   └── users/                         # Almacenamiento persistente de perfiles de usuario y credenciales
│       └── <user-id>.json
│
├── docs/                              # Suite Completa de Documentación Técnica y Arquitectura
│   ├── README.md                      # Índice general de la documentación
│   ├── manual_flexbox_chess.md        # Manual exhaustivo de usuario y desarrollador
│   ├── requerimientos_sistema.md      # Especificación formal de requerimientos (SRS - IEEE 830)
│   ├── especificacion_api_rest_websocket.md # Especificación técnica de endpoints REST y WebSockets
│   ├── guia_integracion_frontend.md   # Guía de integración de la interfaz con el backend
│   ├── ia_y_multisesion.md            # Arquitectura de Inteligencia Artificial y sincronización
│   └── bitacora_cambios_y_arquitectura.md # Bitácora de cambios cronológicos y diagramas Mermaid
│
├── package.json                       # Metadatos del proyecto y dependencias (express, cors)
├── server.js                          # Servidor principal Express y enrutador de la API
└── README.md                          # Este documento
```

---

## 📡 Referencia de la API REST

| Método | Endpoint | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Registra un nuevo usuario con contraseña cifrada (PBKDF2). |
| `POST` | `/api/auth/login` | Inicia sesión y genera token Bearer de sesión. |
| `GET` | `/api/auth/me` | Retorna el perfil del usuario autenticado con el token. |
| `POST` | `/api/auth/logout` | Cierra la sesión activa invalidando el token. |
| `GET` | `/api/users` | Lista todos los usuarios registrados y sus métricas. |
| `GET` | `/api/users/:id/games` | Retorna el historial de partidas disputadas por el usuario y sus estadísticas. |
| `GET` | `/api/my-games` | Retorna las partidas del usuario autenticado en la sesión actual. |
| `GET` | `/api/status/:id` | Obtiene el estado actual de la partida (`board`, `turn`, `status`, `winner`, `in_check`, etc.). |
| `GET` | `/api/games/:id/history/:step` | Reconstruye la posición exacta del tablero en el paso histórico `step` (Solo Lectura). |
| `GET` | `/api/games` | Lista todas las partidas guardadas en el sistema. |
| `POST` | `/api/games` | Crea una nueva partida vinculándola al usuario en sesión como jugador blanco. |
| `POST` | `/api/games/:id/join` | Permite unirse a una partida existente eligiendo bando (`{ side: 'white' \| 'black' }`). |
| `POST` | `/api/games/:id/claim` | Reclama retroactivamente un bando a nombre del usuario autenticado (útil tras jugar como invitado). |
| `POST` | `/api/games/:id/moves` | Aplica una jugada validando reglas oficiales FIDE: trayectoria, jaque, enroque y coronación (`{ from: "e2", to: "e4", promotion?: "queen" }`). |
| `POST` | `/api/games/:id/bot-move` | Solicita al robot que calcule y juegue según el nivel (`{ difficulty: 1..10 }`). |
| `GET` | `/api/bot/levels` | Retorna el catálogo de los 10 niveles de dificultad con descripciones y parámetros. |
| `POST` | `/api/games/:id/reset` | Reinicia la partida a la posición inicial. |
| `POST` | `/api/games/:id/resign` | Declara rendición para el jugador en turno. |

---

## 📚 Documentación Técnica Detallada

Toda la documentación técnica del proyecto se encuentra centralizada en la carpeta [`docs/`](./docs/):

1. **[Índice General de Documentación](./docs/README.md):** Mapa de navegación y catálogo de la documentación.
2. **[Manual de Usuario y Desarrollador](./docs/manual_flexbox_chess.md):** Manual completo del funcionamiento del tablero, arrastrar y soltar, mapeo de piezas y características integradas.
3. **[Especificación de Requerimientos del Sistema (SRS)](./docs/requerimientos_sistema.md):** Documento formal según el estándar IEEE 830 con requerimientos funcionales y no funcionales.
4. **[Especificación Técnica de la API REST y WebSockets](./docs/especificacion_api_rest_websocket.md):** Contratos de datos, esquemas JSON, algoritmos de reloj y endpoints.
5. **[Guía de Integración Frontend <-> API](./docs/guia_integracion_frontend.md):** Manual paso a paso para la conexión de componentes de interfaz con el servidor.
6. **[Inteligencia Artificial y Arquitectura Multi-Sesión](./docs/ia_y_multisesion.md):** Análisis de motores de referencia (Stockfish, Minimax) y calibración de los 10 niveles de IA.
7. **[Bitácora de Cambios y Diagramas de Arquitectura](./docs/bitacora_cambios_y_arquitectura.md):** Registro cronológico exhaustivo de todos los requerimientos implementados uno a uno con diagramas Mermaid de flujo y capas.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo de licencia para más detalles.
