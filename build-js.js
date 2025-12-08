#!/usr/bin/env node

/**
 * JavaScript Build Script
 * Concatenates JavaScript modules in dependency order to create the final app.js
 */

const fs = require('fs');
const path = require('path');

// Define the order of JS files to concatenate (dependency order)
const jsFiles = [
    'static/js/config.js',
    'static/js/layout.js',
    'static/js/connectivity.js',
    'static/js/metrics-parser.js',
    'static/js/card-renderer.js',
    'static/js/drag-drop.js',
    'static/js/groups.js',
    'static/js/app.js'
];

// Output file
const outputFile = 'static/app.js';

console.log('Building JavaScript...');

let combined = '';

// Read and concatenate each file
jsFiles.forEach((file, index) => {
    const filePath = path.join(__dirname, file);
    
    if (!fs.existsSync(filePath)) {
        console.error(`Error: File not found: ${filePath}`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Add source map comment for debugging
    combined += `/* ============================================\n`;
    combined += `   Source: ${file}\n`;
    combined += `   ============================================ */\n\n`;
    combined += content;
    combined += '\n\n';
    
    console.log(`  ✓ ${file}`);
});

// Write the combined JavaScript to output file
fs.writeFileSync(outputFile, combined, 'utf8');

console.log(`\n✓ JavaScript built successfully: ${outputFile}`);
console.log(`  Total size: ${(combined.length / 1024).toFixed(2)} KB`);

