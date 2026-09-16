/**
 * Shared, dependency-free core (SRS §11 "modular structure").
 *
 * The web client and the API both import from here, so the budgeting rules exist
 * in exactly one place. Nothing in this package touches the DOM, the network or
 * any storage engine.
 */
export * from './engine/index.js';
export * from './engine/balances.js';
export * from './data/config.js';
export * from './data/schema.js';
export * from './data/split.js';
export * from './data/expense.js';
export * from './data/actions.js';
