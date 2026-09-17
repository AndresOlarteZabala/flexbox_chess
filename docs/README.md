# Índice de Documentación: Sistema y API de Ajedrez

Bienvenido a la carpeta de documentación técnica del proyecto **Flexbox Chess & Chess API**.

Esta carpeta contiene la documentación integral para el desarrollo de la API de backend, la persistencia de datos, el soporte de modalidades de tiempo y la integración con la interfaz gráfica web.

---

## 📚 Documentos Disponibles

1. **[Manual de Flexbox Chess](./docs/manual_flexbox_chess.md)**
   - Manual completo de usuario y desarrollador del proyecto actual existente.
   - Arquitectura de archivos, ejecución local con `server.js`.
   - Funcionamiento del motor de arrastrar y soltar, tablero Flexbox y mapeo de piezas.
   - Diagnóstico de limitaciones actuales y oportunidades de mejora.

2. **[Especificación de Requerimientos del Sistema (SRS)](./docs/requerimientos_sistema.md)**
   - Requerimientos funcionales y no funcionales detallados.
   - Persistencia de jugadores, partidas e historial paso a paso.
   - Procesamiento de comandos clásicos de ajedrez (SAN, UCI, coordenadas `c2`, `b1`, etc.).
   - Soporte para partidas de larga duración (asíncronas / correspondencia) y partidas con reloj en tiempo real (Bullet, Blitz, Rápido).
   - Reglas oficiales de fin de partida (jaque mate, ahogado, tiempo, tablas).

3. **[Especificación Técnica de la API: REST y WebSockets](./docs/especificacion_api_rest_websocket.md)**
   - Arquitectura y contratos de endpoints REST (`/players`, `/games`, `/games/:id/moves`).
   - Esquemas de base de datos relacional y modelos de datos (Players, Games, GameMoves, GameClocks).
   - Protocolo de eventos en tiempo real (WebSockets) para partidas sincronizadas.
   - Algoritmo de reloj en el servidor con autoridad anti-trampas e incrementos Fischer/Bronstein.

4. **[Guía de Integración Frontend <-> API](./docs/guia_integracion_frontend.md)**
   - Hoja de ruta para conectar `app/js/index.js` y `app/js/chess-rules.js` con el backend.
   - Transformación de eventos `drop(ev)` en llamadas HTTP a la API.
   - Sincronización de marcadores de puntos, turnos y relojes.
   - Manejo de partidas asíncronas mediante sondeo (*polling*) o WebSockets.
   - Casos de prueba de integración recomendados.

5. **[Inteligencia Artificial y Arquitectura Multi-Sesión](./docs/ia_y_multisesion.md)**
   - Motores de referencia de la industria (Stockfish, Minimax, Alpha-Beta, NNUE).
   - Implementación del Robot/Bot en backend (`api/chessAI.js`) con niveles de dificultad (Fácil, Medio, Difícil).
   - Arquitectura y sincronización de partidas automáticas.
   - Conexión y sincronización en tiempo real entre dos sesiones distintas.

6. **[Bitácora de Cambios y Diagramas de Arquitectura](./docs/bitacora_cambios_y_arquitectura.md)**
   - Registro cronológico detallado de todos los requerimientos implementados uno a uno.
   - Matriz de archivos creados y modificados con su propósito.
   - Diagramas Mermaid de arquitectura de capas, flujo de movimientos, motor de Jaque Mate, navegación histórica e IA de 10 niveles.

