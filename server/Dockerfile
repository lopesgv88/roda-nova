FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS=--no-warnings
COPY package*.json ./
# instala tudo (inclui tsx, que roda o TypeScript) e o binário do sharp para Linux
RUN npm ci
COPY . .
EXPOSE 3000
# DATA_DIR deve apontar para um disco persistente (ex.: /data)
CMD ["npm", "run", "start:prod"]
