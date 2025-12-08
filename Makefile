# Govee H5075 Prometheus Exporter - Makefile
# Provides convenient commands for development and deployment
# Compatible with Windows, macOS, and Linux

.PHONY: help run build build-css mock-server docker-build docker-run docker-up docker-down install-deps clean test

# Default target
help: ## Show this help message
	@echo Govee H5075 Prometheus Exporter - Available Commands:
	@echo.
	@echo   help                 Show this help message
	@echo   build-css            Build CSS from source files
	@echo   run                  Run the Go application (builds and runs executable)
	@echo   build                Build the Go binary
	@echo   mock-server          Start development server with mock data (localhost:5000)
	@echo   install-deps         Install Python dependencies for mock server
	@echo   test                 Run all Go tests
	@echo   docker-build         Build Docker image
	@echo   docker-run           Run Docker container (requires docker-build first)
	@echo   docker-up            Start with Docker Compose (localhost:8080)
	@echo   docker-down          Stop Docker Compose containers
	@echo   clean                Clean up build artifacts and stop containers
	@echo.
	@echo Quick Start:
	@echo   make run             Build and run the Go application
	@echo   make mock-server     Start development server with mock data
	@echo   make docker-build    Build Docker image
	@echo   make docker-up       Start production server with Docker Compose

# Development Commands
build-css: ## Build CSS from source files
	@echo Building CSS...
	@node build-css.js

run: build-css build ## Run the Go application (builds first, then runs executable)
	@echo Running Go application...
	@echo UI: http://localhost:8080
	@echo Metrics: http://localhost:8080/metrics
	@echo Press Ctrl+C to stop
	.\govee-exporter.exe

build: build-css ## Build the Go binary
	@echo Building Go binary...
	go build -o govee-exporter.exe .
	@echo Binary created: govee-exporter.exe
mock-server: build-css ## Start the mock server for development (localhost:5000)
	@echo Starting mock server...
	@echo UI: http://localhost:5000
	@echo Metrics: http://localhost:5000/metrics
	@echo Press Ctrl+C to stop
	python mock_server.py

install-deps: ## Install Python dependencies for mock server
	@echo Installing Flask for mock server...
	pip install flask

test: ## Run all Go tests
	@echo Running Go tests...
	go test -v ./...

# Docker Commands
docker-build: ## Build the Docker image
	@echo Building Docker image...
	@echo Image will be tagged as govee-h5075-prom-exporter:latest
	docker build -t govee-h5075-prom-exporter:latest .

docker-run: ## Run Docker container
	@echo Running Docker container...
	@echo UI: http://localhost:8080
	@echo Metrics: http://localhost:8080/metrics
	@echo Note: This runs in host network mode for BLE access
	docker run --rm -it --name govee-exporter --network host --cap-add NET_ADMIN --cap-add NET_RAW govee-h5075-prom-exporter:latest

docker-up: ## Start with Docker Compose (localhost:8080)
	@echo Starting with Docker Compose...
	@echo UI: http://localhost:8080
	@echo Metrics: http://localhost:8080/metrics
	docker-compose up --build -d

docker-down: ## Stop the Docker containers
	@echo Stopping Docker containers...
	docker-compose down

# Utility Commands
clean: ## Clean up build artifacts and stop all containers
	@echo Cleaning up...
	-docker-compose down 2>nul
	-del govee-exporter 2>nul
	-del govee-exporter.exe 2>nul
	@echo Cleanup complete
