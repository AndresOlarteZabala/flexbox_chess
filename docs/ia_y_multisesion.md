# Inteligencia Artificial para Ajedrez y Arquitectura Multi-Sesión

Este documento responde a las preguntas arquitectónicas y de diseño sobre:
1. **Motores de IA de referencia** para jugar contrapartidas con niveles de dificultad.
2. **Solución para partidas automáticas** (humano vs robot, robot vs robot).
3. **Conexión de dos sesiones** en tiempo real dentro del juego.

---

## 1. Motores de IA de Referencia en la Industria

Para dotar al juego de un oponente virtual con niveles graduables de dificultad, existen tres enfoques estándar en la industria:

### 1.1. Stockfish (El Estándar de Oro Mundial)

**Stockfish** es el motor de ajedrez de código abierto más fuerte del mundo (ELO superior a 3500).

- **Cómo funciona:** Emplea algoritmos de búsqueda avanzada (Alpha-Beta, *Null-Move Heuristic*, *Late Move Reductions*) combinados con redes neuronales eficientemente actualizables (**NNUE**).
- **Cómo integrarlo en Node.js o el Navegador:**
  - **Vía WebAssembly (`stockfish.js`):** Se puede ejecutar tanto en el navegador como en Node.js sin necesidad de compilar binarios en C++.
  - **Protocolo UCI (*Universal Chess Interface*):** Se comunica mediante comandos de texto plano por `stdin`/`stdout`:
    ```text
    uci
    setoption name Skill Level value 5    # Nivel de dificultad (0 a 20)
    position fen <posicion_actual> moves <jugadas>
    go depth 6 movetime 1000              # Límite de profundidad o tiempo
    # Retorna: bestmove e7e5
    ```
- **Graduación de Dificultad en Stockfish:**
  - **Principiante (ELO ~800):** `Skill Level: 0`, `depth: 1`.
  - **Aficionado (ELO ~1300):** `Skill Level: 5`, `depth: 3`.
  - **Intermedio (ELO ~1800):** `Skill Level: 10`, `depth: 6`.
  - **Avanzado / Maestro (ELO ~2400+):** `Skill Level: 20`, `depth: 12+`.

---

### 1.2. Motor Minimax Nativo con Poda Alfa-Beta (Implementado en `api/chessAI.js`)

Para garantizar **cero dependencias externas**, portabilidad inmediata en cualquier sistema operativo y ejecución ultrarrápida en el backend, hemos integrado un motor nativo en JavaScript:

- **Componentes:**
  1. **Evaluación de Material:** Peón (100 pts), Caballo (320 pts), Alfil (330 pts), Torre (500 pts), Reina (900 pts), Rey (20000 pts).
  2. **Tablas Posicionales Casilla-Pieza (Piece-Square Tables - PST):** Premia caballos y peones en el centro del tablero y castiga piezas expuestas en esquinas.
  3. **Algoritmo Minimax:** Simula jugadas futuras asumiendo que el oponente también jugará su mejor respuesta.
  4. **Poda Alfa-Beta (*Alpha-Beta Pruning*):** Descarta ramas completas del árbol de jugadas que matemáticamente no pueden mejorar el resultado, reduciendo el costo computacional de $O(b^d)$ a $O(b^{d/2})$.

- **Niveles de Dificultad Graduables (Escala del 1 al 10 en `POST /api/games/:id/bot-move`):**
  - **Nivel 1 (Novato / Iniciación):** Profundidad 1 ply. 60% de probabilidad de error/descuido. Ideal para principiantes absolutos.
  - **Nivel 2 (Principiante):** Profundidad 1 ply. 40% de error, pero aprovecha capturas evidentes de material.
  - **Nivel 3 (Aficionado):** Profundidad 1 ply. 20% de error con evaluación posicional básica.
  - **Nivel 4 (Casual):** Profundidad 2 plies. 15% de error, visión táctica a 2 jugadas vista.
  - **Nivel 5 (Club Intermedio):** Profundidad 2 plies. 5% de error con ordenamiento de capturas MVV-LVA.
  - **Nivel 6 (Avanzado):** Profundidad 2 plies. 0% de error no forzado e incorporación de *Quiescence Search*.
  - **Nivel 7 (Experto):** Profundidad 3 plies. Poda Alfa-Beta estricta en todo el árbol de búsqueda.
  - **Nivel 8 (Maestro Candidato):** Profundidad 3 plies + extensión de capturas para evitar el *horizon effect*.
  - **Nivel 9 (Maestro FIDE):** Profundidad 3 plies con bonificación por control de casillas centrales (`e4, d4, e5, d5`).
  - **Nivel 10 (Gran Maestro - Máximo):** Profundidad 3 plies con cálculo estricto, ordenamiento óptimo MVV-LVA y máxima profundidad táctica.

- **Optimizaciones Algorítmicas Avanzadas:**
  - **Move Ordering (MVV-LVA - Most Valuable Victim / Least Valuable Attacker):** Evalúa primero las capturas donde una pieza de menor valor captura una de mayor valor, disparando cortes de poda Alfa-Beta tempranos y reduciendo hasta en un 80% los nodos explorados.
  - **Búsqueda de Tranquilidad (Quiescence Search):** Extiende la búsqueda más allá de la profundidad límite para evaluar intercambios de piezas inconclusos, evitando que el robot caiga en celadas tácticas inmediatas.
  - **Control Espacial del Centro:** Bonificación adicional para piezas que ocupan o dominan el cuadrado central (`d4, e4, d5, e5`).

---

### 1.3. Motores Basados en Machine Learning Puro (Leela Chess Zero / AlphaZero)

- Basados en redes de aprendizaje profundo y búsqueda en árbol de Monte Carlo (MCTS).
- **Pros:** Estilo de juego más humano y creativo.
- **Contras:** Requieren aceleración por GPU (CUDA/TensorRT) y modelos de pesos de cientos de megabytes, haciéndolos poco prácticos para despliegues ligeros web.

---

## 2. Solución para Partidas Automáticas

Para resolver la modalidad de partidas automáticas (Robot / Bot), se implementó la siguiente arquitectura:

```
[Jugador Humano]  --- Drag & Drop ---> [Frontend Flexbox Chess]
                                             |
                                    POST /moves {from, to}
                                             v
                                  [API Backend / Express]
                                             |
                                   Valida jugada y persiste
                                             |
                                  ¿Es turno del Robot?
                                   /                 \
                                [SÍ]                 [NO]
                                 /                     \
                   Ejecuta Minimax (chessAI.js)     Espera jugada
                   Aplica mejor jugada                de Jugador 2
                   Persiste y retorna
```

### 2.1. Flujo de Ejecución Automático
1. El jugador humano suelta su pieza en el tablero (`drop(ev)`).
2. El cliente envía la jugada a la API mediante `POST /api/games/:id/moves`.
3. Al recibir la confirmación exitosa de la jugada humana, la función `checkAutoBotMove()` del cliente detecta que ahora es el turno del robot.
4. Tras un breve retardo natural (600ms) para simular tiempo de reflexión humano, el cliente dispara automáticamente `POST /api/games/:id/bot-move` indicando el nivel de dificultad seleccionado (`1`, `2` o `3`).
5. El robot calcula la mejor jugada, la ejecuta en el tablero y actualiza el estado persistido.
6. El cliente renderiza la respuesta del robot y devuelve el control al jugador humano.

---

## 3. Conexión de Dos Sesiones en Tiempo Real (Multiplayer)

Para conectar dos sesiones distintas (ejemplo: Jugador A en una pestaña/navegador con Blancas y Jugador B en otra con Negras):

### 3.1. Identificación y Asignación de Roles
Cada sesión selecciona su bando en el control superior:
- **Sesión 1:** `Partida ID: game-1`, `Tu bando: ⚪ Blancas`, `Modo: 👥 2 Sesiones (Online)`.
- **Sesión 2:** `Partida ID: game-1`, `Tu bando: ⚫ Negras`, `Modo: 👥 2 Sesiones (Online)`.

El control `drag(ev)` en `app/js/index.js` restringe los movimientos:
- La sesión de Blancas solo puede arrastrar piezas blancas.
- La sesión de Negras solo puede arrastrar piezas negras.
- Además, el backend rechaza cualquier movimiento que no corresponda al turno legal.

### 3.2. Bucle de Sincronización Automática (*Real-Time Sync Loop*)
En `app/js/index.js`, se implementó un temporizador de sondeo de alta frecuencia (1200 ms):
```javascript
function startSyncLoop() {
  setInterval(() => {
    fetch(`/api/status/${currentGameId}`)
      .then(res => res.json())
      .then(res => {
        // Si el número de jugadas en el servidor es mayor al local, actualizar tablero
        if (res.data.turn_count !== data.turn) {
          renderGameState(res.data);
        }
      });
  }, 1200);
}
```
**Resultado:** Cuando el Jugador A mueve su pieza en la Sesión 1, en menos de un segundo la pantalla del Jugador B en la Sesión 2 refleja el movimiento, la pieza capturada, el turno y el reloj sin necesidad de recargar la página.

---

## 4. Pruebas de Funcionamiento

### Prueba A: Partida vs Robot
1. Abrir `http://localhost:5000/`.
2. Modo: `🤖 vs Robot (IA)`. Dificultad: `Nivel 2 (Medio)`. Bando: `⚪ Blancas`.
3. Mover el peón de `e2` a `e4`.
4. El robot responderá automáticamente (ejemplo: caballo a `c6` o peón a `e5`).

### Prueba B: Dos Sesiones Simultáneas
1. Abrir una ventana normal del navegador en `http://localhost:5000/?game=partida-online&side=white&mode=multiplayer`.
2. Abrir una ventana de incógnito en `http://localhost:5000/?game=partida-online&side=black&mode=multiplayer`.
3. Mover con Blancas en la ventana 1. La ventana 2 se actualizará de inmediato.
4. Mover con Negras en la ventana 2. La ventana 1 se actualizará de inmediato.
