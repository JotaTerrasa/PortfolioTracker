export const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', USDT: 'tether',
  USDC: 'usd-coin', SOL: 'solana', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2',
  DOT: 'polkadot', LINK: 'chainlink', MATIC: 'polygon',
  POL: 'polygon', SHIB: 'shiba-inu', DAI: 'dai',
  LTC: 'litecoin', BCH: 'bitcoin-cash', UNI: 'uniswap',
  NEAR: 'near', LEO: 'bitfinex-leo', XLM: 'stellar',
  ICP: 'internet-computer', ETC: 'ethereum-classic',
  ATOM: 'cosmos', FIL: 'filecoin', HBAR: 'hedera-hashgraph',
  KAS: 'kaspa', APT: 'aptos', OP: 'optimism', ARB: 'arbitrum',
  HYPE: 'hyperliquid', RAY: 'raydium',
  ASTR: 'astar', ASTER: 'aster-2',
  VSN: 'vision-network',
};

export const STABLECOINS = {
  USDT: {
    price: 1.0,
    change24h: 0,
    icon: 'https://assets.coingecko.com/coins/images/325/large/Tether.png',
    ath: 1.32,
  },
  USDC: {
    price: 1.0,
    change24h: 0,
    icon: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
    ath: 2.17,
  },
  DAI: {
    price: 1.0,
    change24h: 0,
    icon: 'https://assets.coingecko.com/coins/images/9956/large/Badge_Dai.png',
    ath: 3.67,
  },
};

export const IGNORED_TOKENS = ['VSN', 'USDC'];
export const ONE_YEAR_HIGH_TOKENS = ['ASTER', 'RAY', 'HYPE'];
