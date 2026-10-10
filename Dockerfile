# Imagen de producción de Flexbox Chess.
# Requiere Node.js 22.13+ por node:sqlite; se usa 24 LTS.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5000

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --chown=node:node . .
# data/ guarda chess.db; se monta como volumen para persistir entre despliegues
# Los paquetes extraidos con umask 077 pueden tener permisos 600/700.
# El usuario de ejecucion debe poder leer y recorrer todos los archivos.
RUN mkdir -p data && chown -R node:node /app && chmod -R u+rwX /app

USER node
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/bot/levels').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.js"]
