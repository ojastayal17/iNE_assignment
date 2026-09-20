FROM mcr.microsoft.com/playwright:v1.48.0-noble

WORKDIR /app

# Skip downloading browsers during npm install since the base image already has them.
# This prevents Render free-tier builds from running out of memory.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "server.js"]
