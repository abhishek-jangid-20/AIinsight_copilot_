FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["npm", "start"]
