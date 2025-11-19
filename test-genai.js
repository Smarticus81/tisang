import * as pkg from '@google/genai';
console.log('Exports:', Object.keys(pkg));
try {
    console.log('Default export keys:', Object.keys(pkg.default || {}));
} catch (e) { }
