import axios from 'axios';
import ccxt from 'ccxt';
import { IGNORED_TOKENS } from '../config/portfolio.js';
import { getCoinGeckoPrices, getEurRate, getExchangePrices } from './pricing.js';

function hasValue(amount) {
  return Number(amount) > 0;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTradeNetBaseAmount(trade) {
  const amount = safeNumber(trade.amount);
  const fee = safeNumber(trade.fee?.cost);
  const feeCurrency = trade.fee?.currency?.toUpperCase?.() || null;
  const baseCoin = trade.symbol?.split('/')?.[0]?.toUpperCase?.() || null;

  if (trade.side === 'buy' && fee > 0 && feeCurrency && baseCoin && feeCurrency === baseCoin) {
    return Math.max(0, amount - fee);
  }

  return amount;
}

export function calculateRemainingCostBasisFromTrades(trades) {
  let quantity = 0;
  let invested = 0;

  const orderedTrades = [...trades]
    .filter((trade) => trade && (trade.side === 'buy' || trade.side === 'sell'))
    .sort((a, b) => safeNumber(a.timestamp) - safeNumber(b.timestamp));

  for (const trade of orderedTrades) {
    const amount = getTradeNetBaseAmount(trade);
    const cost = safeNumber(trade.cost, amount * safeNumber(trade.price));

    if (amount <= 0) continue;

    if (trade.side === 'buy') {
      quantity += amount;
      invested += cost;
      continue;
    }

    if (quantity <= 0) continue;

    const amountToRemove = Math.min(amount, quantity);
    const avgCost = invested / quantity;
    quantity -= amountToRemove;
    invested -= avgCost * amountToRemove;

    if (quantity <= 1e-12) {
      quantity = 0;
      invested = 0;
    }
  }

  if (quantity <= 0 || invested <= 0) return null;

  return {
    quantity,
    totalInvested: invested,
    avgCost: invested / quantity,
  };
}

function buildCostBasisEntry({ avgCost, totalInvested, source, nativeCurrency = 'USD', usdPerNative = 1 }) {
  const safeUsdPerNative = usdPerNative > 0 ? usdPerNative : 1;
  return {
    avgCostNative: avgCost,
    totalInvestedNative: totalInvested,
    nativeCurrency,
    usdPerNative: safeUsdPerNative,
    avgCostUsd: avgCost * safeUsdPerNative,
    totalInvestedUsd: totalInvested * safeUsdPerNative,
    source,
  };
}

function applyManualCostOverrides(costBasis, assets, exchangePrefix, envPrefix, nativeCurrency, usdPerNative) {
  for (const asset of assets) {
    const symbol = asset.coin.toUpperCase();
    const key = `${exchangePrefix}${asset.coin}`;
    const manualTotal = safeNumber(process.env[`${envPrefix}_COST_${symbol}`]);
    const manualAvg = safeNumber(process.env[`${envPrefix}_AVG_PRICE_${symbol}`]);

    if (costBasis[key]) continue;

    if (manualAvg > 0) {
      costBasis[key] = buildCostBasisEntry({
        avgCost: manualAvg,
        totalInvested: manualAvg * asset.amount,
        source: 'manual_avg',
        nativeCurrency,
        usdPerNative,
      });
    } else if (manualTotal > 0 && asset.amount > 0) {
      costBasis[key] = buildCostBasisEntry({
        avgCost: manualTotal / asset.amount,
        totalInvested: manualTotal,
        source: 'manual_total',
        nativeCurrency,
        usdPerNative,
      });
    }
  }
}

async function fetchBingxTradesForSymbol(client, coin) {
  const symbol = `${coin}/USDT`;
  const collected = [];
  const pageLimit = 1000;
  let since = undefined;

  for (let page = 0; page < 10; page += 1) {
    const batch = await client.fetchMyTrades(symbol, since, pageLimit);
    if (!Array.isArray(batch) || batch.length === 0) break;

    collected.push(...batch);

    const lastTimestamp = safeNumber(batch[batch.length - 1]?.timestamp);
    if (!lastTimestamp || batch.length < pageLimit) break;
    since = lastTimestamp + 1;

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return collected;
}

async function loadBingxAssets() {
  if (!(process.env.BINGX_API_KEY && process.env.BINGX_SECRET_KEY)) {
    return { client: null, assets: [] };
  }

  const client = new ccxt.bingx({
    apiKey: process.env.BINGX_API_KEY,
    secret: process.env.BINGX_SECRET_KEY,
  });

  const balance = await client.fetchBalance();
  const assets = Object.entries(balance.total)
    .filter(([coin, amount]) => hasValue(amount) && !IGNORED_TOKENS.includes(coin.toUpperCase()))
    .map(([coin, amount]) => ({ coin, amount }));

  return { client, assets };
}

async function loadBitpandaAssets() {
  if (!process.env.BITPANDA_API_KEY) return [];

  const response = await axios.get('https://api.bitpanda.com/v1/asset-wallets', {
    headers: { 'X-API-KEY': process.env.BITPANDA_API_KEY },
  });

  const assets = [];
  ['cryptocoin', 'commodity', 'index'].forEach((section) => {
    const wallets = response.data.data.attributes[section]?.attributes?.wallets || [];
    wallets.forEach((wallet) => {
      const amount = parseFloat(wallet.attributes.balance);
      const symbol = wallet.attributes.cryptocoin_symbol || wallet.attributes.symbol || wallet.attributes.name;
      if (hasValue(amount) && !IGNORED_TOKENS.includes(symbol.toUpperCase())) {
        assets.push({ coin: symbol, amount });
      }
    });
  });

  return assets;
}

async function buildPriceMap(symbols, bingxClient) {
  const cgPrices = await getCoinGeckoPrices(symbols);
  const exPrices = await getExchangePrices(symbols.filter((symbol) => !cgPrices[symbol.toUpperCase()]), bingxClient);
  const prices = {};
  symbols.forEach((symbol) => {
    const key = symbol.toUpperCase();
    prices[key] = cgPrices[key] || exPrices[key] || { price: 0, change24h: 0 };
  });
  return prices;
}

async function buildCostBasis(balances, bingxClient, eurRate) {
  const costBasis = {};
  const usdPerEur = eurRate > 0 ? 1 / eurRate : 1;

  if (bingxClient) {
    for (const asset of balances.bingx) {
      try {
        const trades = await fetchBingxTradesForSymbol(bingxClient, asset.coin);
        const computed = calculateRemainingCostBasisFromTrades(trades);
        if (computed && computed.avgCost > 0) {
          costBasis[asset.coin] = buildCostBasisEntry({
            avgCost: computed.avgCost,
            totalInvested: computed.avgCost * asset.amount,
            source: 'bingx_trades',
            nativeCurrency: 'USDT',
            usdPerNative: 1,
          });
        }
      } catch {
        // Ignore per-asset trade history failures and keep response flowing.
      }
    }
  }

  if (process.env.BITPANDA_API_KEY) {
    try {
      let allBpTrades = [];
      let nextUrl = 'https://api.bitpanda.com/v1/trades?page_size=500';

      while (nextUrl) {
        const response = await axios.get(nextUrl, {
          headers: { 'X-API-KEY': process.env.BITPANDA_API_KEY },
        });
        allBpTrades = allBpTrades.concat(response.data.data || []);
        nextUrl = response.data.links?.next || null;
        if (allBpTrades.length > 5000) break;
      }

      const groupedTrades = {};
      allBpTrades.forEach((trade) => {
        const attrs = trade.attributes || {};
        const symbol = attrs.cryptocoin_symbol;
        if (!symbol || IGNORED_TOKENS.includes(symbol.toUpperCase())) return;
        if (attrs.status !== 'finished') return;
        if (attrs.type !== 'buy' && attrs.type !== 'sell') return;

        if (!groupedTrades[symbol]) groupedTrades[symbol] = [];
        groupedTrades[symbol].push({
          side: attrs.type,
          timestamp: Date.parse(attrs.time?.completed_at || attrs.time?.created_at || trade.id || 0),
          amount: safeNumber(attrs.amount_cryptocoin),
          cost: safeNumber(attrs.amount_fiat) || (safeNumber(attrs.amount_cryptocoin) * safeNumber(attrs.price)),
          price: safeNumber(attrs.price),
          fee: null,
        });
      });

      Object.entries(groupedTrades).forEach(([symbol, trades]) => {
        const computed = calculateRemainingCostBasisFromTrades(trades);
        const assetMatch = balances.bitpanda.find((asset) => asset.coin === symbol);
        if (computed && computed.avgCost > 0 && assetMatch) {
          costBasis[`bp_${symbol}`] = buildCostBasisEntry({
            avgCost: computed.avgCost,
            totalInvested: computed.avgCost * assetMatch.amount,
            source: 'bitpanda_trades',
            nativeCurrency: 'EUR',
            usdPerNative: usdPerEur,
          });
        }
      });
    } catch {
      // Ignore Bitpanda trade-history parsing failures for resilience.
    }
  }

  applyManualCostOverrides(costBasis, balances.bitpanda, 'bp_', 'BITPANDA', 'EUR', usdPerEur);
  applyManualCostOverrides(costBasis, balances.bingx, '', 'BINGX', 'USDT', 1);

  return costBasis;
}

export async function getInternalBalance() {
  try {
    const { client: bingxClient, assets: bingxAssets } = await loadBingxAssets();
    const bitpandaAssets = await loadBitpandaAssets();
    const symbols = [...new Set([...bingxAssets, ...bitpandaAssets].map((asset) => asset.coin))];
    const prices = await buildPriceMap(symbols, bingxClient);

    return [...bingxAssets, ...bitpandaAssets].reduce((total, asset) => {
      return total + (asset.amount * (prices[asset.coin.toUpperCase()]?.price || 0));
    }, 0);
  } catch (e) {
    console.error('[Snapshot] Error calculating balance:', e.message);
    return null;
  }
}

export async function getPortfolioSnapshot() {
  const balances = { bingx: [], bitpanda: [], total_usd: 0, total_invested: 0, total_pnl: 0, eur_rate: 0.92 };
  const { client: bingxClient, assets: bingxAssets } = await loadBingxAssets();
  const bitpandaAssets = await loadBitpandaAssets();

  balances.bingx = bingxAssets;
  balances.bitpanda = bitpandaAssets;

  const symbols = [...new Set([...balances.bingx, ...balances.bitpanda].map((asset) => asset.coin))];
  const prices = await buildPriceMap(symbols, bingxClient);
  balances.eur_rate = await getEurRate();
  const costBasis = await buildCostBasis(balances, bingxClient, balances.eur_rate);

  balances.bingx = balances.bingx.map((asset) => {
    const priceData = prices[asset.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
    const value = asset.amount * priceData.price;
    const cost = costBasis[asset.coin];
    const invested = cost?.totalInvestedUsd || 0;
    const pnl = cost ? value - invested : null;
    balances.total_usd += value;
    if (cost) balances.total_invested += invested;
    if (pnl !== null) balances.total_pnl += pnl;
    return {
      ...asset,
      price: priceData.price,
      change24h: priceData.change24h,
      icon: priceData.icon,
      ath: priceData.ath,
      value,
      avgCost: cost?.avgCostUsd || null,
      avgCostNative: cost?.avgCostNative || null,
      avgCostCurrency: cost?.nativeCurrency || null,
      invested,
      investedNative: cost?.totalInvestedNative || 0,
      investedNativeCurrency: cost?.nativeCurrency || null,
      pnl,
      pnlPct: cost && invested > 0 ? (pnl / invested) * 100 : null,
      costBasisSource: cost?.source || null,
    };
  });

  balances.bitpanda = balances.bitpanda.map((asset) => {
    const priceData = prices[asset.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
    const value = asset.amount * priceData.price;
    const cost = costBasis[`bp_${asset.coin}`];
    const invested = cost?.totalInvestedUsd || 0;
    const pnl = cost ? value - invested : null;
    balances.total_usd += value;
    if (cost) balances.total_invested += invested;
    if (pnl !== null) balances.total_pnl += pnl;
    return {
      ...asset,
      price: priceData.price,
      change24h: priceData.change24h,
      icon: priceData.icon,
      ath: priceData.ath,
      value,
      avgCost: cost?.avgCostUsd || null,
      avgCostNative: cost?.avgCostNative || null,
      avgCostCurrency: cost?.nativeCurrency || null,
      invested,
      investedNative: cost?.totalInvestedNative || 0,
      investedNativeCurrency: cost?.nativeCurrency || null,
      pnl,
      pnlPct: cost && invested > 0 ? (pnl / invested) * 100 : null,
      costBasisSource: cost?.source || null,
    };
  });

  return balances;
}
