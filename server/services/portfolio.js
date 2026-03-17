import axios from 'axios';
import ccxt from 'ccxt';
import { IGNORED_TOKENS } from '../config/portfolio.js';
import { getCoinGeckoPrices, getEurRate, getExchangePrices } from './pricing.js';

function hasValue(amount) {
  return Number(amount) > 0;
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

async function buildCostBasis(balances, bingxClient) {
  const costBasis = {};
  const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);

  if (bingxClient) {
    for (const asset of balances.bingx) {
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const trades = await bingxClient.fetchMyTrades(`${asset.coin}/USDT`, oneYearAgo, 1000);
        let totalBought = 0;
        let totalCost = 0;
        trades.forEach((trade) => {
          if (trade.side === 'buy') {
            totalBought += trade.amount;
            totalCost += trade.cost;
          }
        });
        if (totalBought > 0) {
          const avg = totalCost / totalBought;
          costBasis[asset.coin] = { avgCost: avg, totalInvested: avg * asset.amount };
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

      const bpStats = {};
      allBpTrades.forEach((trade) => {
        const attrs = trade.attributes;
        if (attrs.status === 'finished' && attrs.type === 'buy') {
          const symbol = attrs.cryptocoin_symbol;
          if (IGNORED_TOKENS.includes(symbol.toUpperCase())) return;
          if (!bpStats[symbol]) bpStats[symbol] = { tb: 0, tc: 0 };
          const amount = parseFloat(attrs.amount_cryptocoin);
          const cost = parseFloat(attrs.amount_fiat) || (amount * parseFloat(attrs.price));
          bpStats[symbol].tb += amount;
          bpStats[symbol].tc += cost;
        }
      });

      Object.keys(bpStats).forEach((symbol) => {
        const stats = bpStats[symbol];
        if (stats.tb > 0) {
          const assetMatch = balances.bitpanda.find((asset) => asset.coin === symbol);
          const amount = assetMatch ? assetMatch.amount : 0;
          costBasis[`bp_${symbol}`] = {
            avgCost: stats.tc / stats.tb,
            totalInvested: (stats.tc / stats.tb) * amount,
          };
        }
      });
    } catch {
      // Ignore Bitpanda trade-history parsing failures for resilience.
    }
  }

  for (const asset of balances.bitpanda) {
    const symbol = asset.coin.toUpperCase();
    const manualTotal = parseFloat(process.env[`BITPANDA_COST_${symbol}`]);
    const manualAvg = parseFloat(process.env[`BITPANDA_AVG_PRICE_${symbol}`]);

    if (manualAvg > 0) {
      costBasis[`bp_${asset.coin}`] = { avgCost: manualAvg, totalInvested: manualAvg * asset.amount };
    } else if (manualTotal > 0) {
      costBasis[`bp_${asset.coin}`] = { avgCost: manualTotal / asset.amount, totalInvested: manualTotal };
    }
  }

  for (const asset of balances.bingx) {
    const symbol = asset.coin.toUpperCase();
    const manualTotal = parseFloat(process.env[`BINGX_COST_${symbol}`]);
    const manualAvg = parseFloat(process.env[`BINGX_AVG_PRICE_${symbol}`]);

    if (manualAvg > 0) {
      costBasis[asset.coin] = { avgCost: manualAvg, totalInvested: manualAvg * asset.amount };
    } else if (manualTotal > 0) {
      costBasis[asset.coin] = { avgCost: manualTotal / asset.amount, totalInvested: manualTotal };
    }
  }

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
  const costBasis = await buildCostBasis(balances, bingxClient);

  balances.bingx = balances.bingx.map((asset) => {
    const priceData = prices[asset.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
    const value = asset.amount * priceData.price;
    const cost = costBasis[asset.coin];
    const invested = cost?.totalInvested || 0;
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
      avgCost: cost?.avgCost || null,
      invested,
      pnl,
      pnlPct: cost && invested > 0 ? (pnl / invested) * 100 : null,
    };
  });

  balances.bitpanda = balances.bitpanda.map((asset) => {
    const priceData = prices[asset.coin.toUpperCase()] || { price: 0, change24h: 0, icon: null, ath: 0 };
    const value = asset.amount * priceData.price;
    const cost = costBasis[`bp_${asset.coin}`];
    const invested = cost?.totalInvested || 0;
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
      avgCost: cost?.avgCost || null,
      invested,
      pnl,
      pnlPct: cost && invested > 0 ? (pnl / invested) * 100 : null,
    };
  });

  balances.eur_rate = await getEurRate();
  return balances;
}
