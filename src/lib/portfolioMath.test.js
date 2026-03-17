import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTaxSpain } from './portfolioMath.js';

test('calculateTaxSpain returns zero for non-positive profits', () => {
  assert.equal(calculateTaxSpain(0, 0.92), 0);
  assert.equal(calculateTaxSpain(-100, 0.92), 0);
});

test('calculateTaxSpain applies progressive brackets', () => {
  const taxUsd = calculateTaxSpain(10000, 1);
  assert.equal(Number(taxUsd.toFixed(2)), 1980.00);
});

test('calculateTaxSpain converts EUR tax back to USD using rate', () => {
  const taxUsd = calculateTaxSpain(10000, 0.5);
  assert.equal(Number(taxUsd.toFixed(2)), 1900.00);
});
