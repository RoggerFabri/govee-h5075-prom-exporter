#!/usr/bin/env node

/**
 * CSS Build Script
 * Concatenates CSS files in order to create the final styles.css
 */

const fs = require('fs');
const path = require('path');

// Define the order of CSS files to concatenate
const cssFiles = [
    'static/css/_variables.css',
    'static/css/_base.css',
    'static/css/_components.css',
    'static/css/_layouts.css',
    'static/css/_themes.css',
    'static/css/_responsive.css'
];

// Output file
const outputFile = 'static/styles.css';

// CSS Layers declaration (must be first)
const layersDeclaration = '@layer base, components, layouts, themes, responsive;\n\n';

console.log('Building CSS...');

let combined = layersDeclaration;

// Read and concatenate each file
cssFiles.forEach((file, index) => {
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

// Write the combined CSS to output file
fs.writeFileSync(outputFile, combined, 'utf8');

console.log(`\n✓ CSS built successfully: ${outputFile}`);
console.log(`  Total size: ${(combined.length / 1024).toFixed(2)} KB`);

