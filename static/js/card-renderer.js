// CardRenderer - Single source of truth for all card rendering logic

// Helper function to normalize temperature
function normalizeTemp(temp) {
    const tempRange = MAX_TEMPERATURE - MIN_TEMPERATURE;
    const normalizedTemp = ((temp - MIN_TEMPERATURE) / tempRange) * 100;
    return Math.max(0, Math.min(100, normalizedTemp));
}

// Helper function to escape HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Helper function to create metric element
function createMetricElement(label, value, unit, type, previousValue = null, showPlaceholder = false) {
    if (showPlaceholder) {
        return `
        <div class="metric ${type}" data-value="-">
            <div class="metric-header">
                <span>${label}</span>
                <span class="metric-value" aria-label="${label} is unavailable">
                    -${unit}
                </span>
            </div>
            <div class="progress-bar" 
                 role="progressbar" 
                 aria-valuenow="0" 
                 aria-valuemin="${type === 'temperature' ? MIN_TEMPERATURE : '0'}" 
                 aria-valuemax="${type === 'temperature' ? MAX_TEMPERATURE : '100'}"
                 aria-label="${label} level unavailable">
                <div class="progress" style="width: 0%"></div>
            </div>
        </div>
    `;
    }
    const percentage = type === 'temperature' ? normalizeTemp(value) : Math.max(0, value);
    const showBatteryWarning = type === 'battery' && value <= BATTERY_LOW_THRESHOLD;
    const showFreezingWarning = type === 'temperature' && value < TEMPERATURE_LOW_THRESHOLD;
    const showHotWarning = type === 'temperature' && value > TEMPERATURE_HIGH_THRESHOLD;
    const showHighHumidityWarning = type === 'humidity' && value > HUMIDITY_HIGH_THRESHOLD;
    const showLowHumidityWarning = type === 'humidity' && value < HUMIDITY_LOW_THRESHOLD;
    const hasChanged = previousValue !== null && Math.abs(value - previousValue) >= 0.1;
    const changeClass = hasChanged ? 'changed' : '';
    
    // Determine warning message and icon based on type
    let warningLabel = '';
    let warningIcon = '';
    
    if (showBatteryWarning) {
        warningLabel = 'Low Battery Warning';
        warningIcon = `
            <span class="warning-icon" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    } else if (showFreezingWarning) {
        warningLabel = 'Freezing Temperature Warning';
        warningIcon = `
            <span class="warning-icon freezing-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2L13.09 8.26L22 9L13.09 9.74L12 16L10.91 9.74L2 9L10.91 8.26L12 2M12 6L11.5 8.5L9 9L11.5 9.5L12 12L12.5 9.5L15 9L12.5 8.5L12 6Z"/>
                </svg>
            </span>
        `;
    } else if (showHotWarning) {
        warningLabel = 'High Temperature Warning';
        warningIcon = `
            <span class="warning-icon hot-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M11.5 3.5c0 .83-.67 1.5-1.5 1.5S8.5 4.33 8.5 3.5 9.17 2 10 2s1.5.67 1.5 1.5zM6.5 6c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S8.83 7.5 8 7.5 6.5 6.83 6.5 6zm7 0c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm2.5-2.5c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5zM12 8c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 8c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
                </svg>
            </span>
        `;
    } else if (showHighHumidityWarning) {
        warningLabel = 'High Humidity Warning';
        warningIcon = `
            <span class="warning-icon high-humidity-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zm0 15.93A5.5 5.5 0 0 1 6.5 13c0-1.48.58-2.92 1.66-4l.01-.01L12 5.27l3.83 3.82.01.01c1.08 1.08 1.66 2.52 1.66 4a5.5 5.5 0 0 1-5.5 5.62z"/>
                </svg>
            </span>
        `;
    } else if (showLowHumidityWarning) {
        warningLabel = 'Low Humidity Warning';
        warningIcon = `
            <span class="warning-icon low-humidity-warning" role="alert" aria-label="${warningLabel}">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0zm0 15.93A5.5 5.5 0 0 1 6.5 13c0-1.48.58-2.92 1.66-4l.01-.01L12 5.27l3.83 3.82.01.01c1.08 1.08 1.66 2.52 1.66 4a5.5 5.5 0 0 1-5.5 5.62zM9 12c0 1.66 1.34 3 3 3s3-1.34 3-3H9z"/>
                </svg>
            </span>
        `;
    }

    return `
        <div class="metric ${type}" data-value="${value}">
            <div class="metric-header">
                <span>${label}</span>
                <span class="metric-value ${changeClass}" aria-label="${label} is ${value}${unit}">
                    ${value}${unit}
                    ${warningIcon}
                </span>
            </div>
            <div class="progress-bar" 
                 role="progressbar" 
                 aria-valuenow="${value}" 
                 aria-valuemin="${type === 'temperature' ? MIN_TEMPERATURE : '0'}" 
                 aria-valuemax="${type === 'temperature' ? MAX_TEMPERATURE : '100'}"
                 aria-label="${label} level">
                <div class="progress" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}

// Helper function to create compact metrics
function createCompactMetrics(data, excludeStatusChip = false) {
    const metrics = [];
    
    // Temperature
    if (typeof data.temperature !== 'undefined') {
        const temp = data.temperature.toFixed(1);
        const showFreezingWarning = data.temperature < TEMPERATURE_LOW_THRESHOLD;
        const showHotWarning = data.temperature > TEMPERATURE_HIGH_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Temperature';
        if (showFreezingWarning) {
            warningClass = 'temp-low';
            ariaLabel = 'Low Temperature Warning';
        } else if (showHotWarning) {
            warningClass = 'temp-high';
            ariaLabel = 'High Temperature Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M15 13V5c0-1.66-1.34-3-3-3S9 3.34 9 5v8c-1.21.91-2 2.37-2 4 0 2.76 2.24 5 5 5s5-2.24 5-5c0-1.63-.79-3.09-2-4zm-4-8c0-.55.45-1 1-1s1 .45 1 1h-1v1h1v2h-1v1h1v2h-1v1h1v.5c-.31-.18-.65-.3-1-.34V5z"/>
                </svg>${temp}°C
            </span>
        `);
    }
    
    // Humidity
    if (typeof data.humidity !== 'undefined') {
        const humid = data.humidity.toFixed(1);
        const showHighHumidityWarning = data.humidity > HUMIDITY_HIGH_THRESHOLD;
        const showLowHumidityWarning = data.humidity < HUMIDITY_LOW_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Humidity';
        if (showHighHumidityWarning) {
            warningClass = 'humidity-high';
            ariaLabel = 'High Humidity Warning';
        } else if (showLowHumidityWarning) {
            warningClass = 'humidity-low';
            ariaLabel = 'Low Humidity Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0L12 2.69zM12 4.8L8.05 8.75a6 6 0 1 0 7.9 0L12 4.8z"/>
                </svg>${humid}%
            </span>
        `);
    }
    
    // Battery
    if (typeof data.battery !== 'undefined') {
        const batt = Math.round(data.battery);
        const showBatteryWarning = batt <= BATTERY_LOW_THRESHOLD;
        
        let warningClass = '';
        let ariaLabel = 'Battery';
        if (showBatteryWarning) {
            warningClass = 'battery-low';
            ariaLabel = 'Low Battery Warning';
        }
        
        metrics.push(`
            <span class="compact-metric ${warningClass}" title="${ariaLabel}" role="${warningClass ? 'alert' : ''}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/>
                </svg>${batt}%
            </span>
        `);
    }
    
    // Status indicator (stale/missing) - icon only
    // Skip if excludeStatusChip is true (e.g., in desktop layout where we show it in header)
    if (!excludeStatusChip && data.status && data.status !== 'active' && !data.isWeatherStation) {
        const statusLabel = data.status === 'never_seen' ? 'Missing' : 'Stale';
        metrics.push(`
            <span class="compact-metric status-chip status-${data.status}" title="${statusLabel}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `);
    }
    
    return `<div class="metrics-compact">${metrics.join('')}</div>`;
}

class CardRenderer {
    // Build render context - make all decisions in one place
    buildRenderContext(deviceData, layoutMode) {
        const isDesktop = layoutMode === 'desktop' || (layoutMode === 'auto' && window.innerWidth > 600);
        const status = deviceData.status || 'active';
        const isStale = status === 'stale' || status === 'never_seen';
        const hasMetrics = typeof deviceData.temperature !== 'undefined' || 
                          typeof deviceData.humidity !== 'undefined' || 
                          typeof deviceData.battery !== 'undefined';
        const isWeatherStation = deviceData.isWeatherStation || false;
        
        const shouldShowPlaceholderMetrics = isStale && !isWeatherStation && !hasMetrics && isDesktop;
        const shouldAddNoMetricsClass = !hasMetrics && !shouldShowPlaceholderMetrics;
        
        return {
            isDesktop,
            isStale,
            hasMetrics,
            isWeatherStation,
            status,
            shouldShowPlaceholderMetrics,
            shouldAddNoMetricsClass,
            statusLabel: isStale && !isWeatherStation 
                ? (status === 'never_seen' ? 'Missing' : 'Stale')
                : ''
        };
    }
    
    // Create warning chip HTML
    createWarningChip(status, label) {
        return `
            <span class="compact-metric status-chip status-${status} card-header-warning-chip" title="${label}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    }
    
    // Create status chip for compact metrics
    createStatusChip(status, label) {
        return `
            <span class="compact-metric status-chip status-${status}" title="${label}" role="status">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
            </span>
        `;
    }
    
    // Create placeholder metrics HTML
    createPlaceholderMetrics() {
        return `
            ${createMetricElement('Temperature', 0, '°C', 'temperature', null, true)}
            ${createMetricElement('Humidity', 0, '%', 'humidity', null, true)}
            ${createMetricElement('Battery', 0, '%', 'battery', null, true)}
        `;
    }
    
    // Render card HTML - single method for all card rendering
    renderCardHTML(deviceName, deviceData, previousValues = {}, layoutMode = 'auto') {
        const context = this.buildRenderContext(deviceData, layoutMode);
        const title = escapeHtml(deviceData.displayName || deviceName);
        const baseClass = context.isWeatherStation ? 'card weather-station' : 'card';
        const cardClass = baseClass + 
            (context.isStale ? ' card-stale' : '') + 
            (context.shouldAddNoMetricsClass ? ' card-no-metrics' : '');
        
        const statusTooltip = context.statusLabel ? ` title="${context.statusLabel}"` : '';
        
        // Create compact metrics (exclude status chip in desktop when showing placeholder metrics)
        const excludeStatusChip = context.isDesktop && context.shouldShowPlaceholderMetrics;
        const compactMetrics = createCompactMetrics(deviceData, excludeStatusChip);
        
        // Weather station footer
        const weatherFooter = context.isWeatherStation ? `
            <div class="card-footer">
                <small>Source: Open-Meteo API</small>
            </div>
        ` : '';
        
        // Metrics block
        const metricsBlock = context.hasMetrics ? `
            ${typeof deviceData.temperature !== 'undefined' ? createMetricElement('Temperature', deviceData.temperature.toFixed(1), '°C', 'temperature', previousValues.temperature) : ''}
            ${typeof deviceData.humidity !== 'undefined' ? createMetricElement('Humidity', deviceData.humidity.toFixed(1), '%', 'humidity', previousValues.humidity) : ''}
            ${typeof deviceData.battery !== 'undefined' ? createMetricElement('Battery', Math.round(deviceData.battery), '%', 'battery', previousValues.battery) : ''}
        ` : '';
        
        // Warning chip for desktop layout
        const warningChip = context.statusLabel && context.isDesktop ? 
            this.createWarningChip(context.status, context.statusLabel) : '';
        
        // For missing/stale devices without metrics in mobile/auto: simpler structure
        if (!context.hasMetrics && context.isStale && !context.isWeatherStation && !context.isDesktop) {
            return `
                <div class="${cardClass}" data-room="${escapeHtml(deviceName)}"${statusTooltip}>
                    <h2>${title}</h2>
                    ${compactMetrics}
                </div>
            `;
        }
        
        // For desktop: show placeholder metrics for stale devices without metrics
        const finalMetricsBlock = context.shouldShowPlaceholderMetrics 
            ? this.createPlaceholderMetrics()
            : metricsBlock;
        
        return `
            <div class="${cardClass}" data-room="${escapeHtml(deviceName)}"${statusTooltip}>
                <div class="card-header-row">
                    <h2>${title}</h2>
                    ${warningChip}
                    ${compactMetrics}
                </div>
                ${finalMetricsBlock}
                ${weatherFooter}
            </div>
        `;
    }
    
    // Update existing card DOM element based on new context
    updateCardElement(cardElement, deviceData, previousValues = {}, layoutMode = 'auto') {
        const context = this.buildRenderContext(deviceData, layoutMode);
        const roomName = cardElement.getAttribute('data-room');
        if (!roomName) return;
        
        // Update classes
        cardElement.classList.toggle('card-stale', context.isStale && !context.isWeatherStation);
        cardElement.classList.toggle('card-no-metrics', context.shouldAddNoMetricsClass);
        
        // Update tooltip
        if (context.statusLabel) {
            cardElement.setAttribute('title', context.statusLabel);
        } else {
            cardElement.removeAttribute('title');
        }
        
        // Update title if display name changed
        const titleEl = cardElement.querySelector('h2');
        const desiredTitle = deviceData.displayName || roomName;
        if (titleEl && titleEl.textContent !== desiredTitle) {
            titleEl.textContent = desiredTitle;
        }
        
        // Handle layout-specific updates
        if (context.isDesktop) {
            this.updateCardForDesktop(cardElement, context, deviceData);
        } else {
            this.updateCardForMobile(cardElement, context, deviceData);
        }
        
        // Update metric values if they exist
        this.updateMetricValues(cardElement, deviceData, previousValues);
    }
    
    // Update card for desktop layout
    updateCardForDesktop(cardElement, context, deviceData) {
        // Convert card-no-metrics to full layout with placeholder metrics
        // Check if card currently has card-no-metrics class OR if we need to show placeholder metrics
        const hasNoMetricsClass = cardElement.classList.contains('card-no-metrics');
        const needsPlaceholderMetrics = context.shouldShowPlaceholderMetrics && !context.hasMetrics;
        
        if (hasNoMetricsClass || needsPlaceholderMetrics) {
            cardElement.classList.remove('card-no-metrics');
            
            let headerRow = cardElement.querySelector('.card-header-row');
            const h2 = cardElement.querySelector('h2');
            
            // If h2 is a direct child (mobile layout), we need to create headerRow
            if (!headerRow && h2 && h2.parentNode === cardElement) {
                const compactMetrics = cardElement.querySelector('.metrics-compact');
                headerRow = document.createElement('div');
                headerRow.className = 'card-header-row';
                h2.parentNode.insertBefore(headerRow, h2);
                headerRow.appendChild(h2);
                if (compactMetrics && compactMetrics.parentNode === cardElement) {
                    headerRow.appendChild(compactMetrics);
                }
            } else if (headerRow && h2 && h2.parentNode !== headerRow) {
                // If headerRow exists but h2 is not in it, move h2 into headerRow
                headerRow.insertBefore(h2, headerRow.firstChild);
            }
            
            // Add placeholder metrics if they don't exist
            if (!cardElement.querySelectorAll('.metric').length && headerRow) {
                headerRow.insertAdjacentHTML('afterend', this.createPlaceholderMetrics());
            }
        }
        
        // Ensure warning chip exists in header
        const headerRow = cardElement.querySelector('.card-header-row');
        if (headerRow && context.statusLabel) {
            const existingChip = headerRow.querySelector('.card-header-warning-chip');
            if (!existingChip) {
                const chipHTML = this.createWarningChip(context.status, context.statusLabel);
                const titleEl = headerRow.querySelector('h2');
                if (titleEl) {
                    titleEl.insertAdjacentHTML('afterend', chipHTML);
                }
            }
        }
    }
    
    // Update card for mobile layout
    updateCardForMobile(cardElement, context, deviceData) {
        const headerRow = cardElement.querySelector('.card-header-row');
        
        // Remove warning chip from header
        if (headerRow) {
            const warningChip = headerRow.querySelector('.card-header-warning-chip');
            if (warningChip) {
                warningChip.remove();
            }
        }
        
        // If card has placeholder metrics (from desktop), convert to mobile compact layout
        const hasPlaceholderMetrics = cardElement.querySelectorAll('.metric').length === 3 && 
            cardElement.querySelector('.metric .metric-value')?.textContent?.includes('-');
        
        if (hasPlaceholderMetrics && !context.shouldAddNoMetricsClass) {
            // Remove placeholder metrics
            const metrics = cardElement.querySelectorAll('.metric');
            metrics.forEach(m => m.remove());
            
            // Add card-no-metrics class
            cardElement.classList.add('card-no-metrics');
            
            // Ensure compact metrics exist with status chip
            let compactContainer = cardElement.querySelector('.metrics-compact');
            if (!compactContainer) {
                const compactMetricsHTML = `
                    <div class="metrics-compact">
                        ${this.createStatusChip(context.status, context.statusLabel)}
                    </div>
                `;
                const h2 = cardElement.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentHTML('afterend', compactMetricsHTML);
                }
            } else {
                // Ensure status chip is in compact metrics
                const statusChip = compactContainer.querySelector('.status-chip');
                if (!statusChip && context.statusLabel) {
                    compactContainer.insertAdjacentHTML('beforeend', this.createStatusChip(context.status, context.statusLabel));
                }
            }
            
            // Remove header row structure for mobile (h2 should be direct child)
            if (headerRow) {
                const h2 = headerRow.querySelector('h2');
                const compactMetrics = headerRow.querySelector('.metrics-compact');
                if (h2) {
                    headerRow.parentNode.insertBefore(h2, headerRow);
                    if (compactMetrics) {
                        h2.insertAdjacentElement('afterend', compactMetrics);
                    }
                    headerRow.remove();
                }
            }
        } else if (context.shouldAddNoMetricsClass) {
            // Card already has card-no-metrics, just ensure compact metrics with status chip exists
            let compactContainer = cardElement.querySelector('.metrics-compact');
            if (!compactContainer && context.statusLabel) {
                const compactMetricsHTML = `
                    <div class="metrics-compact">
                        ${this.createStatusChip(context.status, context.statusLabel)}
                    </div>
                `;
                const h2 = cardElement.querySelector('h2');
                if (h2) {
                    h2.insertAdjacentHTML('afterend', compactMetricsHTML);
                }
            } else if (compactContainer && context.statusLabel) {
                const statusChip = compactContainer.querySelector('.status-chip');
                if (!statusChip) {
                    compactContainer.insertAdjacentHTML('beforeend', this.createStatusChip(context.status, context.statusLabel));
                }
            }
        }
    }
    
    // Update metric values in existing card
    updateMetricValues(cardElement, deviceData, previousValues) {
        // Update temperature
        if (typeof deviceData.temperature !== 'undefined') {
            const tempMetric = cardElement.querySelector('.temperature');
            if (tempMetric) {
                const valueSpan = tempMetric.querySelector('.metric-value');
                const progressBar = tempMetric.querySelector('.progress');
                const newTemp = deviceData.temperature.toFixed(1);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newTemp}°C`) {
                        if (previousValues.temperature !== null && Math.abs(deviceData.temperature - previousValues.temperature) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newTemp}°C`;
                        }
                    }
                }
                
                if (progressBar) {
                    const newWidth = normalizeTemp(deviceData.temperature);
                    progressBar.style.width = `${newWidth}%`;
                }
            }
        }
        
        // Update humidity
        if (typeof deviceData.humidity !== 'undefined') {
            const humidMetric = cardElement.querySelector('.humidity');
            if (humidMetric) {
                const valueSpan = humidMetric.querySelector('.metric-value');
                const progressBar = humidMetric.querySelector('.progress');
                const newHumid = deviceData.humidity.toFixed(1);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newHumid}%`) {
                        if (previousValues.humidity !== null && Math.abs(deviceData.humidity - previousValues.humidity) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newHumid}%`;
                        }
                    }
                }
                
                if (progressBar) {
                    progressBar.style.width = `${Math.max(0, deviceData.humidity)}%`;
                }
            }
        }
        
        // Update battery
        if (typeof deviceData.battery !== 'undefined') {
            const battMetric = cardElement.querySelector('.battery');
            if (battMetric) {
                const valueSpan = battMetric.querySelector('.metric-value');
                const progressBar = battMetric.querySelector('.progress');
                const newBatt = Math.round(deviceData.battery);
                
                if (valueSpan) {
                    const currentText = valueSpan.childNodes[0]?.textContent?.trim();
                    if (currentText !== `${newBatt}%`) {
                        if (previousValues.battery !== null && Math.abs(deviceData.battery - previousValues.battery) >= 0.1) {
                            valueSpan.classList.add('changed');
                            setTimeout(() => valueSpan.classList.remove('changed'), 1000);
                        }
                        if (valueSpan.childNodes[0]) {
                            valueSpan.childNodes[0].textContent = `${newBatt}%`;
                        }
                    }
                }
                
                if (progressBar) {
                    progressBar.style.width = `${Math.max(0, deviceData.battery)}%`;
                }
            }
        }
        
        // Update compact metrics
        const compactContainer = cardElement.querySelector('.metrics-compact');
        if (compactContainer) {
            const layoutMode = isDesktopLayoutMode() ? 'desktop' : 'mobile';
            const context = this.buildRenderContext(deviceData, layoutMode);
            const excludeStatusChip = context.isDesktop && context.shouldShowPlaceholderMetrics;
            const compactMetrics = createCompactMetrics(deviceData, excludeStatusChip);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = compactMetrics;
            const newCompactContainer = tempDiv.firstElementChild;
            if (newCompactContainer) {
                compactContainer.replaceWith(newCompactContainer);
            }
        }
    }
}

// Create global instance
const cardRenderer = new CardRenderer();

