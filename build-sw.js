#!/usr/bin/env node

/**
 * Service Worker Build Script
 * Updates the CACHE_NAME in sw.js with a content hash of the built assets.
 * Run after build-css.js and build-js.js so the hash reflects the current output.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const assets = [
    'static/styles.css',
    'static/app.js',
];

const swFile = 'static/sw.js';

console.log('Building service worker cache version...');

// Hash the combined content of all built assets
const hash = crypto.createHash('sha1');
assets.forEach((asset) => {
    const filePath = path.join(__dirname, asset);
    if (!fs.existsSync(filePath)) {
        console.error(`Error: Asset not found: ${filePath} — run build-css and build-js first`);
        process.exit(1);
    }
    hash.update(fs.readFileSync(filePath));
    console.log(`  ✓ ${asset}`);
});
const version = hash.digest('hex').slice(0, 8);

// Replace the CACHE_NAME line in sw.js
const swPath = path.join(__dirname, swFile);
const sw = fs.readFileSync(swPath, 'utf8');
const updated = sw.replace(
    /const CACHE_NAME = 'govee-sensors-[^']*';/,
    `const CACHE_NAME = 'govee-sensors-${version}';`
);

if (sw === updated) {
    console.log(`\n  Cache version unchanged: govee-sensors-${version}`);
} else {
    fs.writeFileSync(swPath, updated, 'utf8');
    console.log(`\n✓ Service worker updated: govee-sensors-${version}`);
}
