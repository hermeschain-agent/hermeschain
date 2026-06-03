FROM node:20-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install
RUN cd frontend && npm install

COPY backend ./backend
COPY frontend ./frontend

RUN cd backend && npm run build
RUN cd frontend && npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git openssh-client \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

RUN cd backend && npm install --omit=dev \
  && cd ../frontend && npm install --omit=dev \
  && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY docker/railway-cd-shim /usr/local/bin/cd

RUN chmod +x /usr/local/bin/cd

WORKDIR /app/backend
EXPOSE 3001

CMD ["npm", "start"]
