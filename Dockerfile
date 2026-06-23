FROM node:20-alpine
WORKDIR /app

# Instala dependências (tsx está em dependencies, não devDependencies)
COPY package*.json ./
RUN npm ci --omit=dev

# Copia código-fonte TypeScript
COPY tsconfig*.json ./
COPY server.ts ./
COPY _api/ ./_api/

# Para servir o frontend no VPS, descomente e rode `npm run build` antes:
# COPY dist/ ./dist/

ENV NODE_ENV=production
ENV SERVE_STATIC=false
EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
