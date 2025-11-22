# Govee H5075 Prometheus Exporter - Makefile
# Provides convenient commands for development and deployment
# Compatible with Windows, macOS, and Linux

.PHONY: help mock-server docker-build docker-up docker-down install-deps clean

# Default target
help: ## Show this help message
	@echo Govee H5075 Prometheus Exporter - Available Commands:
	@echo.
	@echo   help                 Show this help message
	@echo   mock-server          Start development server with mock data (localhost:5000)
	@echo   install-deps         Install Python dependencies for mock server
	@echo   docker-build         Build the Docker image
	@echo   docker-up            Start production server with Docker (localhost:8080)
	@echo   docker-down          Stop the Docker containers
	@echo   clean                Clean up build artifacts and stop containers
	@echo.
	@echo Quick Start:
	@echo   make mock-server     Start development server with mock data
	@echo   make docker-up       Start production server with Docker

# Development Commands
mock-server: ## Start the mock server for development (localhost:5000)
	@echo Starting mock server...
	@echo UI: http://localhost:5000
	@echo Metrics: http://localhost:5000/metrics
	@echo Press Ctrl+C to stop
	python mock_server.py

install-deps: ## Install Python dependencies for mock server
	@echo Installing Flask for mock server...
	pip install flask

# Docker Commands
docker-build: ## Build the Docker image
	@echo Building Docker image...
	docker-compose build

docker-up: ## Start the production server with Docker (localhost:8080)
	@echo Starting production server with Docker...
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
