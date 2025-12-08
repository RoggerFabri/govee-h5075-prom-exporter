# Dockerfile Guide

This project contains multiple Dockerfiles optimized for different build scenarios:

## Dockerfile (Default - Multi-stage Build)

**Use case**: Local development, direct Docker builds without CI/CD

**Features**:

- Multi-stage build with Go builder stage
- Builds Go binary inside Docker
- Includes all build optimizations (cache mounts, parallel compilation)
- Self-contained - only requires `docker build`

**Build command**:

```bash
docker build -t govee-exporter:latest .
```

## Dockerfile.prebuilt (Optimized for CI/CD)

**Use case**: GitHub Actions and CI/CD pipelines with pre-built binaries

**Features**:

- Minimal Alpine-only image (no Go toolchain)
- Expects pre-compiled binary in build context
- Faster builds when binary is compiled natively
- Used by GitHub Actions workflows with native Go cross-compilation

**Build command**:

```bash
# First compile the binary
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-w -s" -o govee_exporter .

# Then build Docker image
docker build -f Dockerfile.prebuilt -t govee-exporter:latest .
```

## Dockerfile.builder (Backup/Reference)

**Use case**: Reference copy of the original multi-stage Dockerfile

**Features**:

- Backup of the original Dockerfile with builder stages
- Kept for reference and fallback scenarios
- Same as `Dockerfile` but preserved before CI/CD optimizations

## Which One Should I Use?

- **Local development**: Use `Dockerfile` (default)
- **GitHub Actions**: Uses `Dockerfile.prebuilt` automatically (configured in workflows)
- **Manual CI/CD**: Use `Dockerfile.prebuilt` if you can pre-compile the binary, otherwise use `Dockerfile`

## Performance Comparison

| Dockerfile | Build Time (Cold) | Build Time (Cached) | Notes |
|------------|------------------|---------------------|-------|
| Dockerfile | ~2-3 min | ~30-60 sec | Full multi-stage build |
| Dockerfile.prebuilt | ~10-15 sec | ~5-10 sec | Binary pre-compiled (5-10x faster) |

## GitHub Actions Workflow

Both AMD64 and ARM64 workflows now use native Go cross-compilation:

1. **Checkout code**
2. **Setup Go with caching** (native AMD64 runner)
3. **Cross-compile binary** using `GOARCH=amd64` or `GOARCH=arm64`
4. **Build Docker image** using `Dockerfile.prebuilt`

