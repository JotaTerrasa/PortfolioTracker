import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCumulativeCostBasisFromTrades, calculateRemainingCostBasisFromTrades } from './portfolio.js';

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

test('bitpanda spot average matches non-margin ASTER example', () => {
  const result = calculateRemainingCostBasisFromTrades([
    { side: 'buy', amount: 1683.91966906, cost: 2931.83, timestamp: 1 },
    { side: 'buy', amount: 314.83187905, cost: 500.0, timestamp: 2 },
    { side: 'buy', amount: 131.37398234, cost: 200.0, timestamp: 3 },
    { side: 'buy', amount: 104.4291755, cost: 150.0, timestamp: 4 },
    { side: 'buy', amount: 320.58911113, cost: 300.0, timestamp: 5 },
  ]);

  assert.ok(result);
  assert.equal(Number(result.quantity.toFixed(8)), 2555.14381708);
  assert.equal(Number(result.avgCost.toFixed(4)), 1.5975);
});

test('calculateCumulativeCostBasisFromTrades matches BingX cumulative cost formula', () => {
  const result = calculateCumulativeCostBasisFromTrades([
    { side: 'buy', amount: 4483.835, cost: 3210.42586, fee: { currency: 'ASTER', cost: 4.483835 }, symbol: 'ASTER/USDT', timestamp: 1 },
    { side: 'sell', amount: 4458.92, cost: 3219.34024, symbol: 'ASTER/USDT', timestamp: 2 },
    { side: 'buy', amount: 4335.349, cost: 3216.828958, fee: { currency: 'ASTER', cost: 4.335349 }, symbol: 'ASTER/USDT', timestamp: 3 },
  ]);

  assert.ok(result);
  assert.equal(Number(result.quantity.toFixed(6)), 4351.444816);
  assert.equal(Number(result.avgCost.toFixed(6)), 0.735869);
});
