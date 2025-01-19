# Stage 1: Build the Go application
FROM golang:1.23.4 AS builder

# Set environment variables for cross-compilation
ENV CGO_ENABLED=0

# Set the working directory inside the container
WORKDIR /app

# Copy the Go modules manifests and download dependencies
COPY go.mod go.sum ./
RUN go mod download

# Copy the application source code
COPY . .

# Build the Go application
RUN go build -o govee_exporter main.go

# Stage 2: Create a minimal runtime container
FROM alpine:3.21

# Install certificates for HTTPS support
RUN apk --no-cache add ca-certificates && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

# Set the working directory in the runtime container
WORKDIR /app

# Create a logs directory
RUN mkdir logs

# Copy the built application from the builder stage
COPY --from=builder /app/govee_exporter .

# Expose the default HTTP port
EXPOSE 8080

# Command to run the application
ENTRYPOINT ["./govee_exporter"]
