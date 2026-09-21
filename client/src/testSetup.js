import { JSDOM } from 'jsdom';
// Node 25 exposes an unavailable native localStorage by default. Use the DOM
// implementation explicitly so these tests exercise actual Web Storage semantics.
const storageWindow = new JSDOM('', { url: 'http://localhost' }).window;
Object.defineProperty(window, 'localStorage', { configurable: true, value: storageWindow.localStorage });
Object.defineProperty(window, 'sessionStorage', { configurable: true, value: storageWindow.sessionStorage });
