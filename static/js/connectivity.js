// Connection status tracking

let lastSuccessfulFetch = Date.now();

// Check connection status periodically
setInterval(() => {
    const timeSinceLastSuccess = Date.now() - lastSuccessfulFetch;
    if (timeSinceLastSuccess > REFRESH_INTERVAL * 2) {
        updateConnectivityStatus('disconnected');
    }
}, REFRESH_INTERVAL);

function updateConnectivityStatus(status) {
    const indicator = document.querySelector('.connectivity-indicator');
    if (!indicator) return;
    
    const prevState = indicator.className.split(' ')[1];
    
    if (prevState !== status) {
        indicator.className = `connectivity-indicator ${status}`;
        
        const statusMessages = {
            'connected': 'Connected to sensor network',
            'disconnected': 'Connection lost to sensor network',
            'error': 'Error connecting to sensor network'
        };
        indicator.setAttribute('aria-label', statusMessages[status]);
        
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'alert');
        announcement.style.position = 'absolute';
        announcement.style.width = '1px';
        announcement.style.height = '1px';
        announcement.style.overflow = 'hidden';
        announcement.textContent = statusMessages[status];
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 3000);
    }
}

function markFetchSuccess() {
    lastSuccessfulFetch = Date.now();
    updateConnectivityStatus('connected');
}

