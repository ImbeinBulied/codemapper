FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN npm install --production --ignore-scripts
EXPOSE 5001
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["view", "."]
