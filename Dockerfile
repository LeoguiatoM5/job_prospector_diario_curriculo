FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm ci --build-from-source \
    && node -e "require('sqlite3'); console.log('sqlite3 OK')"

COPY . .

CMD ["npm", "start"]