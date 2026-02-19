# -----------------------------------------------------------------------------
# Stage 1: deps
# Download Go modules in a separate layer to maximize Docker build cache reuse.
# -----------------------------------------------------------------------------
FROM golang:1.22-alpine AS deps

WORKDIR /src

# git is required for some Go module sources.
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN go mod download

# -----------------------------------------------------------------------------
# Stage 2: builder
# Compile a small, static Linux binary for production.
# -----------------------------------------------------------------------------
FROM golang:1.22-alpine AS builder

WORKDIR /src

COPY --from=deps /go/pkg /go/pkg
COPY . .

# - CGO_ENABLED=0: produce a fully static binary.
# - -trimpath/-s/-w: reduce binary size and remove build path/debug symbols.
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/grms-server \
    ./cmd/server

# -----------------------------------------------------------------------------
# Stage 3: runtime
# Use a minimal image with only certificates/timezone data and a non-root user.
# -----------------------------------------------------------------------------
FROM alpine:3.20 AS runtime

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S app \
    && adduser -S -G app app

WORKDIR /app

COPY --from=builder /out/grms-server /app/grms-server

USER app

# REST API + DoorLink WebSocket.
EXPOSE 4000 4001

ENTRYPOINT ["./grms-server"]
