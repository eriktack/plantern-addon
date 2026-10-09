# Built by Home Assistant itself on the device (BUILD_FROM is its base image; Alpine is the fallback
# for a plain `docker build`). app/ is the snapshot of the Plantern files published with this add-on.
ARG BUILD_FROM=alpine:3.22
FROM $BUILD_FROM

# Node 22+ (built-in WebSocket) for the server; git and ssh for houses kept in a git repository.
RUN apk add --no-cache nodejs git openssh-client \
 && node -e "if (+process.versions.node.split('.')[0] < 22) { console.error('Node 22 or newer is needed, got ' + process.version); process.exit(1); }"

COPY app /app
WORKDIR /app
ENV PORT=3000
EXPOSE 3000
CMD ["node", "tools/serve.js"]
