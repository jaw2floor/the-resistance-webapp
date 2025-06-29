const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'src', 'firebase-init.js');
const outFile = path.join(__dirname, 'public', 'js', 'firebase-init.js');
const envFile = path.join(__dirname, '.env');

const env = {};
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^([^#=]+)=([\s\S]*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
}

function getVar(name) {
  return process.env[name] || env[name] || '';
}

let code = fs.readFileSync(srcFile, 'utf8');
const vars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID'
];
for (const v of vars) {
  const regex = new RegExp(`import.meta.env.${v}`, 'g');
  code = code.replace(regex, JSON.stringify(getVar(v)));
}

fs.writeFileSync(outFile, code);
console.log(`wrote ${outFile}`);
