/**
 * Test fixtures modelling the bills from SRS §2.3 / §5.
 * Nothing here is special-cased in the engine — they are ordinary data.
 */
import { emptyStore, makeBillDefinition, makeMonth, makeTransaction } from '../src/data/schema.js';

export const ANCHOR = '2026-09';

export const rentDef = makeBillDefinition({
  id: 'def_rent', name: 'Rent', category: 'Housing',
  amountType: 'fixed', amount: 18000,
  frequency: 'monthly', dueDay: 1, anchorMonth: ANCHOR, paymentMode: 'scheduled',
});

export const furnitureDef = makeBillDefinition({
  id: 'def_furniture', name: 'Rented furniture', category: 'Furniture',
  amountType: 'fixed', amount: 2400,
  frequency: 'monthly', dueDay: 5, anchorMonth: ANCHOR, paymentMode: 'scheduled',
});

export const wifiDef = makeBillDefinition({
  id: 'def_wifi', name: 'Wi-Fi', category: 'Utilities',
  amountType: 'fixed', amount: 1800,
  frequency: 'quarterly', dueDay: 3, anchorMonth: ANCHOR, paymentMode: 'scheduled',
});

export const waterDef = makeBillDefinition({
  id: 'def_water', name: 'Water purifier', category: 'Utilities',
  amountType: 'fixed', amount: 1050,
  frequency: 'quarterly', dueDay: 3, anchorMonth: ANCHOR, paymentMode: 'scheduled',
});

export const electricityDef = makeBillDefinition({
  id: 'def_electricity', name: 'Electricity', category: 'Utilities',
  amountType: 'variable', amount: null,
  frequency: 'monthly', dueDay: 10, anchorMonth: ANCHOR, paymentMode: 'postpaid',
});

export const insuranceDef = makeBillDefinition({
  id: 'def_insurance', name: 'Bike insurance', category: 'Insurance',
  amountType: 'fixed', amount: 6200,
  frequency: 'custom', intervalMonths: 12, dueDay: 20, anchorMonth: ANCHOR, paymentMode: 'scheduled',
});

export const allDefs = [rentDef, furnitureDef, wifiDef, waterDef, electricityDef];

/** A month with a confirmed electricity bill, used to build estimate history. */
export function monthWithElectricity(monthId, actual) {
  return makeMonth(monthId, {
    income: 60000,
    bills: [{
      id: `${monthId}_def_electricity`,
      defId: 'def_electricity',
      name: 'Electricity',
      category: 'Utilities',
      amountType: 'variable',
      paymentMode: 'postpaid',
      dueDate: `${monthId}-10`,
      status: 'confirmed',
      provisionalAmount: null,
      actualAmount: actual,
      needsInput: false,
      estimateSource: 'average',
      estimateSamples: 0,
    }],
  });
}

export function txn(partial) {
  return makeTransaction(partial);
}

export function storeWith(overrides = {}) {
  return { ...emptyStore(), ...overrides };
}
