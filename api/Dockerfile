# Build stage - cache dependencies
FROM denoland/deno:latest AS builder
WORKDIR /app
COPY deno.json deno.lock ./
COPY *.ts ./
RUN deno cache app.ts

# Runtime stage
FROM denoland/deno:latest
WORKDIR /app

COPY --from=builder /app/ ./
COPY --from=builder /deno-dir/ /deno-dir/

# Run as non-root (deno image provides 'deno' user)
RUN mkdir -p /data && chown deno:deno /data

USER deno
ENV PORT=3000
ENV EVENT_STORE_PATH=/data/events.duckdb
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD deno eval "const r=await fetch('http://localhost:3000/test');if(!r.ok)Deno.exit(1)" --allow-net

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-ffi", "app.ts"]
