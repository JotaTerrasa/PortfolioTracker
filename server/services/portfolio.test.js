import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRemainingCostBasisFromTrades } from './portfolio.js';

test('calculateRemainingCostBasisFromTrades keeps weighted average of remaining inventory', () => {
  const result = calculateRemainingCostBasisFromTrades([
    { side: 'buy', amount: 10, cost: 100, timestamp: 1 },
    { side: 'buy', amount: 10, cost: 300, timestamp: 2 },
    { side: 'sell', amount: 5, cost: 150, timestamp: 3 },
  ]);

  assert.ok(result);
  assert.equal(result.quantity, 15);
  assert.equal(Number(result.totalInvested.toFixed(6)), 300);
  assert.equal(Number(result.avgCost.toFixed(6)), 20);
});

test('calculateRemainingCostBasisFromTrades discounts base-asset fees on buys', () => {
  const result = calculateRemainingCostBasisFromTrades([
    {
      side: 'buy',
      symbol: 'ASTER/USDT',
      amount: 100,
      cost: 80,
      fee: { currency: 'ASTER', cost: 1 },
      timestamp: 1,
    },
  ]);

  assert.ok(result);
  assert.equal(result.quantity, 99);
  assert.equal(Number(result.avgCost.toFixed(6)), Number((80 / 99).toFixed(6)));
});

test('calculateRemainingCostBasisFromTrades returns null when position is fully closed', () => {
  const result = calculateRemainingCostBasisFromTrades([
    { side: 'buy', amount: 2, cost: 20, timestamp: 1 },
    { side: 'sell', amount: 2, cost: 30, timestamp: 2 },
  ]);

  assert.equal(result, null);
});
