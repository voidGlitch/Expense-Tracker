/**
 * Public surface of the calculation engine (SRS §7).
 * Nothing in here touches the DOM, the network or storage — import it anywhere.
 */
export * from './dates.js';
export * from './bills.js';
export * from './budget.js';
export * from './savings.js';
export * from './analytics.js';
// `balances.js` owns the public, minor-unit-safe `simplifyDebts` export. Keep
// the earlier UI helper available under an explicit name so barrel exports do
// not silently pick one of two different implementations.
export {
  calculateSplits,
  calculateNetBalances,
  calculatePairwiseBalances,
  getSplitwiseSummary,
  simplifyDebts as simplifySplitwiseDebts,
} from './splitwise.js';
