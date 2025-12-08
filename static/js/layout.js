// Layout mode detection and management

function isDesktopLayoutMode() {
    // Check if document is available (defensive check)
    if (!document || !document.documentElement) {
        return window.innerWidth > 600; // Fallback to screen width
    }
    
    const layout = document.documentElement.getAttribute('data-layout');
    // Explicit desktop mode
    if (layout === 'desktop') {
        return true;
    }
    // Explicit mobile mode
    if (layout === 'mobile') {
        return false;
    }
    // Auto mode or no layout set: check screen width (desktop if > 600px, matching CSS media query)
    return window.innerWidth > 600;
}

function updateLayoutIcon() {
    const layout = document.documentElement.getAttribute('data-layout') || 'auto';
    const button = document.querySelector('.layout-toggle');
    
    if (button) {
        // Remove all state classes
        button.classList.remove('layout-mobile', 'layout-desktop', 'layout-auto');
        // Add current state class
        button.classList.add(`layout-${layout}`);
    }
}

function toggleLayout() {
    const currentLayout = document.documentElement.getAttribute('data-layout');
    let newLayout;
    
    if (currentLayout === 'mobile') {
        newLayout = 'desktop';
    } else if (currentLayout === 'desktop') {
        newLayout = 'auto';
    } else {
        newLayout = 'mobile';
    }
    
    document.documentElement.setAttribute('data-layout', newLayout);
    localStorage.setItem('layout', newLayout);
    
    // Update button icons visibility
    updateLayoutIcon();
    
    // Trigger layout update callback if it exists
    if (window.onLayoutChange) {
        window.onLayoutChange();
    }
}

