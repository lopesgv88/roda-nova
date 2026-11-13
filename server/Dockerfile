FROM node:22-slim
WORKDIR /app
COPY package*.json ./
# instala tudo (inclui tsx, que roda o TypeScript) e o binário do sharp para Linux.
# --include=dev garante o tsx mesmo que NODE_ENV=production esteja definido pela hospedagem.
RUN npm ci --include=dev
COPY . .
ENV NODE_ENV=production \
    NODE_OPTIONS=--no-warnings
EXPOSE 3000
# DATA_DIR deve apontar para um disco persistente (ex.: /data)
CMD ["npm", "run", "start:prod"]
