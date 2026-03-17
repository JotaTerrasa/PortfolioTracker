import axios from 'axios';
import { COINGECKO_IDS, ONE_YEAR_HIGH_TOKENS, STABLECOINS } from '../config/portfolio.js';

const priceDataCache = {
  data: {},
  highs1y: {},
  lastFetch: 0,
  TTL: 120_000,
};

const eurCache = { rate: null, lastFetch: 0, TTL: 300_000 };

export async function getEurRate() {
  const now = Date.now();
  if (eurCache.rate && now - eurCache.lastFetch < eurCache.TTL) return eurCache.rate;
  try {
    const resp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=eur', { timeout: 5000 });
    eurCache.rate = resp.data?.tether?.eur || 0.92;
    eurCache.lastFetch = now;
  } catch {
    eurCache.rate = eurCache.rate || 0.92;
  }
  return eurCache.rate;
}

export async function sync1YearHighs() {
  console.log('[CoinGecko] Starting exact 1-Year High sync for selected tokens...');
  const to = Math.floor(Date.now() / 1000);
  const from = to - (365 * 24 * 60 * 60);

  for (const sym of ONE_YEAR_HIGH_TOKENS) {
    const id = COINGECKO_IDS[sym];
    if (!id) continue;

    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`, { timeout: 10000 });
      if (response.data && response.data.prices) {
        const prices = response.data.prices.map((p) => p[1]);
        priceDataCache.highs1y[sym] = Math.max(...prices);
      }
    } catch (e) {
      console.log(`[CoinGecko] Could not fetch 1Y high for ${sym}: ${e.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 4500));
  }

  console.log('[CoinGecko] 1-Year High sync complete.');
}

export async function getCoinGeckoPrices(symbols) {
  const now = Date.now();
  const prices = { ...STABLECOINS };

  if (now - priceDataCache.lastFetch < priceDataCache.TTL && Object.keys(priceDataCache.data).length > 0) {
    symbols.forEach((symbol) => {
      const key = symbol.toUpperCase();
      if (priceDataCache.data[key]) prices[key] = priceDataCache.data[key];
    });
    return prices;
  }

  const toFetch = symbols.filter((symbol) => !STABLECOINS[symbol.toUpperCase()]);
  const ids = toFetch.map((symbol) => COINGECKO_IDS[symbol.toUpperCase()]).filter(Boolean);
  const uniqueIds = [...new Set(ids)].join(',');
  if (!uniqueIds) return prices;

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${uniqueIds}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`,
      { timeout: 10000 },
    );

    const dataArr = response.data || [];
    dataArr.forEach((coin) => {
      const matchingSymbols = Object.keys(COINGECKO_IDS).filter((sym) => COINGECKO_IDS[sym] === coin.id);
      matchingSymbols.forEach((sym) => {
        const priceObj = {
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h || 0,
          icon: coin.image,
          ath: priceDataCache.highs1y[sym] || coin.ath || 0,
        };
        prices[sym] = priceObj;
        priceDataCache.data[sym] = priceObj;
      });
    });

    priceDataCache.lastFetch = now;
  } catch (e) {
    console.error('[CoinGecko] Error fetching markets:', e.message);
    if (Object.keys(priceDataCache.data).length > 0) {
      symbols.forEach((symbol) => {
        const key = symbol.toUpperCase();
        if (priceDataCache.data[key]) prices[key] = priceDataCache.data[key];
      });
    }
  }

  return prices;
}

export async function getExchangePrices(symbols, bingxClient) {
  const prices = {};
  if (!bingxClient) return prices;

  for (const symbol of symbols) {
    const key = symbol.toUpperCase();
    if (STABLECOINS[key]) {
      prices[key] = STABLECOINS[key];
      continue;
    }

    try {
      const ticker = await bingxClient.fetchTicker(`${key}/USDT`);
      if (ticker?.last) {
        prices[key] = {
          price: ticker.last,
          change24h: ticker.percentage || 0,
        };
      }
    } catch {
      // Ignore unsupported symbols/tickers on exchange fallback.
    }
  }

  return prices;
}
