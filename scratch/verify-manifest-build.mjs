import fs from 'fs';
import path from 'path';

console.log('======================================================================');
console.log('ANVORA — CHROME EXTENSION MANIFEST & BUILD VERIFICATION');
console.log('======================================================================');

const distPath = path.resolve('dist');
const manifestPath = path.join(distPath, 'manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.error('[FAIL] dist/manifest.json does not exist!');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(`Manifest Version: ${manifest.manifest_version}`);
console.log(`Extension Name:   ${manifest.name}`);
console.log(`Version:          ${manifest.version}`);
console.log(`Description:      ${manifest.description}`);
console.log('----------------------------------------------------------------------');

const itemsToCheck = [];

// 1. Service Worker
if (manifest.background?.service_worker) {
  itemsToCheck.push({
    field: 'background.service_worker',
    relPath: manifest.background.service_worker,
    type: 'Service Worker'
  });
} else {
  console.error('[FAIL] Missing background.service_worker in manifest!');
}

// 2. Content Scripts
if (manifest.content_scripts) {
  manifest.content_scripts.forEach((cs, i) => {
    (cs.js || []).forEach(js => {
      itemsToCheck.push({ field: `content_scripts[${i}].js`, relPath: js, type: 'Content Script' });
    });
  });
}

// 3. Side Panel
if (manifest.side_panel?.default_path) {
  itemsToCheck.push({
    field: 'side_panel.default_path',
    relPath: manifest.side_panel.default_path,
    type: 'Sidepanel HTML'
  });
}

// 4. Options UI
if (manifest.options_ui?.page) {
  itemsToCheck.push({
    field: 'options_ui.page',
    relPath: manifest.options_ui.page,
    type: 'Options HTML'
  });
}

// 5. Icons
if (manifest.icons) {
  Object.entries(manifest.icons).forEach(([sz, p]) => {
    itemsToCheck.push({ field: `icons.${sz}`, relPath: p, type: 'Extension Icon' });
  });
}

if (manifest.action?.default_icon) {
  itemsToCheck.push({ field: 'action.default_icon', relPath: manifest.action.default_icon, type: 'Action Icon' });
}

// 6. Web Accessible Resources
if (manifest.web_accessible_resources) {
  manifest.web_accessible_resources.forEach((war, i) => {
    (war.resources || []).forEach(res => {
      itemsToCheck.push({ field: `web_accessible_resources[${i}]`, relPath: res, type: 'WAR' });
    });
  });
}

let allExist = true;

for (const item of itemsToCheck) {
  const full = path.join(distPath, item.relPath);
  const exists = fs.existsSync(full);
  const size = exists ? fs.statSync(full).size : 0;
  const status = exists ? `[OK]   (${size} bytes)`.padEnd(20) : '[FAIL] (MISSING)   ';
  console.log(`${status} ${item.field.padEnd(30)} -> ${item.relPath}`);
  if (!exists) allExist = false;
}

// Check service-worker-loader.js imported chunks
console.log('----------------------------------------------------------------------');
const swLoaderPath = path.join(distPath, manifest.background?.service_worker || 'service-worker-loader.js');
if (fs.existsSync(swLoaderPath)) {
  const content = fs.readFileSync(swLoaderPath, 'utf8');
  console.log(`Service Worker Loader Entry: ${content.trim()}`);
  
  const importMatch = content.match(/import\s+['"]([^'"]+)['"]/);
  if (importMatch) {
    const importedRel = importMatch[1].replace(/^\.\//, '');
    const importedFull = path.join(distPath, importedRel);
    const importedExists = fs.existsSync(importedFull);
    const sz = importedExists ? fs.statSync(importedFull).size : 0;
    console.log(`${importedExists ? '[OK]' : '[FAIL]'} Service Worker Target Chunk: ${importedRel} (${sz} bytes)`);
    if (!importedExists) allExist = false;

    // Verify target chunk has no broken imports
    if (importedExists) {
      const chunkCode = fs.readFileSync(importedFull, 'utf8');
      const innerImports = chunkCode.match(/import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g) || [];
      for (const imp of innerImports) {
        const m = imp.match(/from\s*['"]([^'"]+)['"]/);
        if (m) {
          const subRel = path.join(path.dirname(importedRel), m[1]);
          const subFull = path.join(distPath, subRel);
          const subExists = fs.existsSync(subFull);
          console.log(`  ${subExists ? '[OK]' : '[FAIL]'} Nested Chunk Import: ${subRel}`);
          if (!subExists) allExist = false;
        }
      }
    }
  }
}

console.log('======================================================================');
if (allExist) {
  console.log('SUCCESS: All files referenced by manifest and service worker loader exist!');
  process.exit(0);
} else {
  console.error('FAILURE: One or more files referenced by manifest do not exist.');
  process.exit(1);
}

