/**
 * Public surface of the calculation engine (SRS §7).
 * Nothing in here touches the DOM, the network or storage — import it anywhere.
 */
export * from './dates.js';
export * from './bills.js';
export * from './budget.js';
export * from './savings.js';
export * from './analytics.js';
