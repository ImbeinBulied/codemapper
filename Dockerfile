FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine
RUN addgroup -S codemapper && adduser -S codemapper -G codemapper
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/wasm ./wasm
COPY --from=build /app/package.json ./
RUN npm install --production --ignore-scripts
RUN chown -R codemapper:codemapper /app
USER codemapper
EXPOSE 5001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:5001/').then(r=>{process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["view", "."]
