# Stage 1: Build the Go application
FROM golang:1.25.4 AS builder

# Set environment variables for cross-compilation
ENV CGO_ENABLED=0

# Set the working directory inside the container
WORKDIR /app

# Copy the Go modules manifests and download dependencies
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

# Pre-compile standard library dependencies
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go install std

# Copy the application source code and static files
COPY . .

# Build the Go application with additional security flags
# Using verbose output to see what's being rebuilt
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    GOMAXPROCS=4 go build -v -trimpath -p 16 -ldflags="-w -s" -o govee_exporter .

# Stage 2: Create a minimal runtime container
FROM alpine:3.22

# Container metadata
LABEL maintainer="Rogger Fabri" \
      description="Govee H5075 Prometheus Exporter" \
      version="1.0.0"

# Security updates and create non-root user
RUN apk update && \
    apk upgrade && \
    apk add --no-cache ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    # Create directory with correct permissions
    mkdir -p /app && \
    chown -R appuser:appgroup /app

# Set the working directory in the runtime container
WORKDIR /app

# Copy the built application and static files from the builder stage
COPY --from=builder /app/govee_exporter .
COPY --from=builder /app/static/. ./static/
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Expose the default HTTP port
EXPOSE 8080

# Add health check using wget
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --spider -q http://localhost:8080/health || exit 1

# Command to run the application
ENTRYPOINT ["./govee_exporter"]
