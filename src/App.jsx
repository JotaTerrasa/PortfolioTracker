import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AlertCircle, LayoutDashboard, Moon, RefreshCw, Rocket, Sun } from 'lucide-react';
import axios from 'axios';
import LoginScreen from './components/LoginScreen';
import DashboardTab from './components/DashboardTab';
import { useDashboardAuth } from './hooks/useDashboardAuth';
import { calculateTaxSpain, fmtSignedPct, fmtUsd } from './lib/portfolioMath';

const SimulatorTab = lazy(() => import('./components/SimulatorTab'));

const App = () => {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [historyRange, setHistoryRange] = useState('24h');
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [targetPrices, setTargetPrices] = useState({});
  const [isLightMode, setIsLightMode] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const authStorageKey = 'dashboard_auth_token';

  useEffect(() => {
    if (isLightMode) document.body.classList.add('light');
    else document.body.classList.remove('light');
  }, [isLightMode]);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { getApiErrorMessage, getAuthHeaders, requestAuthEndpoint, checkAuthStatus } = useDashboardAuth({
    authStorageKey,
    setAuthEnabled,
    setIsAuthenticated,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        axios.get('/api/balance', { headers: getAuthHeaders() }),
        axios.get('/api/history', { headers: getAuthHeaders() }),
      ]);
      setData(balanceRes.data);
      setHistory(historyRes.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err?.response?.status === 401) {
        window.localStorage.removeItem(authStorageKey);
        setAuthEnabled(true);
        setIsAuthenticated(false);
        setLoginError('Sesión expirada. Vuelve a iniciar sesión.');
        setError(null);
        return;
      }
      setError('Error al conectar con el servidor. Verifica que el backend esté funcionando.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authStorageKey, getAuthHeaders]);

  useEffect(() => {
    let interval;
    const init = async () => {
      const status = await checkAuthStatus();
      if (status.enabled && !status.authenticated) {
        setLoading(false);
        return;
      }
      await fetchData();
      interval = setInterval(fetchData, 60000);
    };

    init();
    return () => clearInterval(interval);
  }, [checkAuthStatus, fetchData]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await requestAuthEndpoint({ method: 'post', path: '/auth/login', data: { password: loginPassword } });
      const token = res.data?.token;
      if (!token) throw new Error('No auth token returned');
      window.localStorage.setItem(authStorageKey, token);
      setLoginPassword('');
      setIsAuthenticated(true);
      await fetchData();
    } catch (err) {
      setLoginError(getApiErrorMessage(err, 'No se pudo iniciar sesión.'));
      setLoading(false);
    }
  };

  const handleLogout = () => {
    window.localStorage.removeItem(authStorageKey);
    setIsAuthenticated(false);
    setData(null);
    setHistory([]);
  };

  if (authEnabled && !isAuthenticated && !loading) {
    return <LoginScreen loginPassword={loginPassword} setLoginPassword={setLoginPassword} loginError={loginError} loading={loading} handleLogin={handleLogin} />;
  }

  if (loading && !data) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div className="loader"></div>
        <p style={{ marginTop: '1rem', color: '#94a3b8' }}>Cargando tu ecosistema crypto...</p>
      </div>
    );
  }

  const eurRate = data?.eur_rate || 0.92;
  const allAssets = [
    ...(data?.bingx.map((asset) => ({ ...asset, exchange: 'BingX' })) || []),
    ...(data?.bitpanda.map((asset) => ({ ...asset, exchange: 'Bitpanda' })) || []),
  ].sort((a, b) => b.value - a.value);

  const groupedTokens = allAssets.reduce((acc, curr) => {
    if (!acc[curr.coin]) acc[curr.coin] = { value: 0, weightedChange24h: 0 };
    acc[curr.coin].value += curr.value;
    acc[curr.coin].weightedChange24h += (curr.change24h || 0) * curr.value;
    return acc;
  }, {});

  const tokenDistributionData = Object.entries(groupedTokens)
    .map(([name, stats]) => ({
      name,
      value: stats.value,
      change24h: stats.value > 0 ? stats.weightedChange24h / stats.value : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 18);

  const tokenDistributionTotal = tokenDistributionData.reduce((sum, item) => sum + item.value, 0);
  const tokenTreemapData = tokenDistributionData.map((item) => ({
    ...item,
    percentage: tokenDistributionTotal > 0 ? (item.value / tokenDistributionTotal) * 100 : 0,
  }));

  const isMobile = windowWidth <= 768;
  const getTreemapColor = (change24h) => {
    if (change24h >= 6) return '#15803d';
    if (change24h >= 2) return '#16a34a';
    if (change24h >= 0) return '#22c55e';
    if (change24h >= -2) return '#f87171';
    if (change24h >= -6) return '#ef4444';
    return '#dc2626';
  };

  const renderTreemapNode = ({ x, y, width, height, name, value, change24h, depth }) => {
    if (depth !== 1 || width < 18 || height < 18) return null;
    const fontSize = width > 130 && height > 80 ? 17 : width > 90 && height > 58 ? 13 : 11;
    const showChange = width > 90 && height > 58;
    const showValue = width > 125 && height > 75;
    const textX = x + 10;
    const textY = y + 24;

    return (
      <g>
        <rect x={x} y={y} width={width} height={height} style={{ fill: getTreemapColor(change24h || 0), stroke: 'rgba(255, 255, 255, 0.08)', strokeWidth: 1 }} />
        <text x={textX} y={textY} fill="#f8fafc" fontSize={fontSize} fontWeight={700}>{name}</text>
        {showChange && <text x={textX} y={textY + 20} fill="rgba(248, 250, 252, 0.95)" fontSize={Math.max(11, fontSize - 2)} fontWeight={600}>{fmtSignedPct(change24h || 0)}</text>}
        {showValue && <text x={textX} y={textY + 38} fill="rgba(248, 250, 252, 0.9)" fontSize={Math.max(10, fontSize - 4)}>{fmtUsd(value || 0)}</text>}
      </g>
    );
  };

  const totalPnl = data?.total_pnl || 0;
  const totalInvested = data?.total_invested || 0;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const pnlIsPositive = totalPnl >= 0;
  const investedBingX = allAssets.filter((asset) => asset.exchange === 'BingX').reduce((sum, asset) => sum + (asset.invested || 0), 0);
  const investedBitpanda = allAssets.filter((asset) => asset.exchange === 'Bitpanda').reduce((sum, asset) => sum + (asset.invested || 0), 0);

  const globalBreakEven = allAssets.reduce((acc, asset) => {
    if (asset.avgCost) {
      if (!acc[asset.coin]) acc[asset.coin] = { totalCost: 0, totalAmount: 0 };
      acc[asset.coin].totalCost += asset.invested || (asset.avgCost * asset.amount);
      acc[asset.coin].totalAmount += asset.amount;
    }
    return acc;
  }, {});

  Object.keys(globalBreakEven).forEach((coin) => {
    const breakEven = globalBreakEven[coin];
    globalBreakEven[coin] = breakEven.totalCost / breakEven.totalAmount;
  });

  const totalChange24hUsd = allAssets.reduce((sum, asset) => {
    const dailyChangeFactor = asset.change24h / 100;
    const prevValue = asset.value / (1 + dailyChangeFactor);
    return sum + (asset.value - prevValue);
  }, 0);
  const portfolioPrevValue = data?.total_usd - totalChange24hUsd;
  const totalChange24hPct = portfolioPrevValue > 0 ? (totalChange24hUsd / portfolioPrevValue) * 100 : 0;

  const historyRangeMs = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
  const historyWithTimestamp = history
    .map((point) => ({ timestamp: new Date(point.timestamp).getTime(), fullTime: new Date(point.timestamp).toLocaleString(), value: Number(point.total_usd) || 0 }))
    .filter((point) => Number.isFinite(point.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);

  const historyCutoff = historyRange === 'all' ? null : Date.now() - historyRangeMs[historyRange];
  const historyForChart = historyCutoff ? historyWithTimestamp.filter((point) => point.timestamp >= historyCutoff) : historyWithTimestamp;
  const selectedRangeMs = historyRange === 'all' ? null : historyRangeMs[historyRange];
  const historyIntervals = historyForChart.slice(1).map((point, idx) => point.timestamp - historyForChart[idx].timestamp).filter((interval) => interval > 0);
  const sortedIntervals = [...historyIntervals].sort((a, b) => a - b);
  const medianIntervalMs = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : null;
  const historyChartData = historyForChart;
  const historySpanMs = historyForChart.length > 1 ? historyForChart[historyForChart.length - 1].timestamp - historyForChart[0].timestamp : null;
  const rangeCoveragePct = selectedRangeMs && historySpanMs ? Math.min(100, Math.round((historySpanMs / selectedRangeMs) * 100)) : null;
  const lastHistoryPoint = historyForChart[historyForChart.length - 1] || null;
  const hasSparseHistory = historyForChart.length < 2;
  const historyValues = historyForChart.map((point) => point.value).filter((value) => Number.isFinite(value));
  const yMin = historyValues.length ? Math.min(...historyValues) : 0;
  const yMax = historyValues.length ? Math.max(...historyValues) : 0;
  const ySpread = yMax - yMin;
  const yPadding = ySpread > 0 ? ySpread * 0.14 : Math.max(10, yMax * 0.015 || 10);
  const historyYDomain = [Math.max(0, yMin - yPadding), yMax + yPadding];

  const formatHistoryTick = (timestamp) => {
    const date = new Date(timestamp);
    if (historyRange === '24h') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (historyRange === '7d') return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
  };

  const consolidatedAssets = Object.keys(groupedTokens)
    .filter((coin) => coin.toUpperCase() !== 'USDT')
    .map((coin) => {
      const assets = allAssets.filter((asset) => asset.coin === coin);
      const amount = assets.reduce((sum, asset) => sum + asset.amount, 0);
      const avgCost = globalBreakEven[coin] || (assets.find((asset) => asset.avgCost)?.avgCost) || null;
      const price = assets[0]?.price || 0;
      const icon = assets.find((asset) => asset.icon)?.icon || null;
      const ath = Math.max(...assets.map((asset) => asset.ath || 0), 0);
      const avgCostSourceAsset = assets.find((asset) => asset.avgCost);
      return {
        coin,
        amount,
        avgCost,
        avgCostNative: avgCostSourceAsset?.avgCostNative || null,
        avgCostCurrency: avgCostSourceAsset?.avgCostCurrency || null,
        price,
        icon,
        ath,
      };
    })
    .sort((a, b) => (b.amount * b.price) - (a.amount * a.price));

  const handleTargetChange = (coin, value) => setTargetPrices((prev) => ({ ...prev, [coin]: value }));

  let simTotalProjected = 0;
  let simTotalProfit = 0;
  let simTotalCostBase = 0;
  consolidatedAssets.forEach((asset) => {
    const targetVal = parseFloat(targetPrices[asset.coin]);
    const isTargetValid = !Number.isNaN(targetVal) && targetVal > 0;
    const costBase = asset.avgCost ? asset.avgCost * asset.amount : 0;
    if (isTargetValid) {
      const projected = asset.amount * targetVal;
      simTotalProjected += projected;
      if (costBase > 0) {
        simTotalCostBase += costBase;
        simTotalProfit += projected - costBase;
      }
    }
  });

  const simTaxUsd = calculateTaxSpain(simTotalProfit, eurRate);
  const simNetUsd = simTotalProfit - simTaxUsd;
  const simTotalNetPocketUsd = simTotalProjected - simTaxUsd;

  return (
    <div className="dashboard-container">
      <header className="header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="logo-icon" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: '0.75rem', padding: '0.5rem', display: 'flex' }}>
              <LayoutDashboard size={24} color="white" />
            </div>
            <h1>Crypto Dashboard</h1>
          </div>
          <p className="header-subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Última actualización: {lastUpdated.toLocaleTimeString()}
            <span style={{ marginLeft: '1rem', opacity: 0.7 }}>1 USD ≈ {eurRate.toFixed(4)} EUR</span>
          </p>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {authEnabled && <button className="refresh-button" onClick={handleLogout}>Cerrar sesión</button>}
          <button className="refresh-button" style={{ padding: '0.75rem' }} onClick={() => setIsLightMode(!isLightMode)}>{isLightMode ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button className="refresh-button" onClick={fetchData} disabled={loading}>
            {loading ? <div className="loader" style={{ width: 14, height: 14 }}></div> : <RefreshCw size={16} />}
            {loading ? 'Sincronizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ marginBottom: '2rem', borderColor: '#f43f5e', background: 'rgba(244, 63, 94, 0.1)' }}>
          <div className="stat-label" style={{ color: '#f43f5e' }}><AlertCircle size={18} /> Error de Conexión</div>
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
        </div>
      )}

      <div className="tabs-container">
        <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}><LayoutDashboard size={18} /> Dashboard</button>
        <button className={`tab ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}><Rocket size={18} /> Simulador</button>
      </div>

      {activeTab === 'dashboard' && (
        <DashboardTab
          data={data}
          eurRate={eurRate}
          isMobile={isMobile}
          historyRange={historyRange}
          setHistoryRange={setHistoryRange}
          allAssets={allAssets}
          tokenTreemapData={tokenTreemapData}
          renderTreemapNode={renderTreemapNode}
          totalChange24hUsd={totalChange24hUsd}
          totalChange24hPct={totalChange24hPct}
          totalPnl={totalPnl}
          totalPnlPct={totalPnlPct}
          pnlIsPositive={pnlIsPositive}
          totalInvested={totalInvested}
          investedBingX={investedBingX}
          investedBitpanda={investedBitpanda}
          historyForChart={historyForChart}
          historySpanMs={historySpanMs}
          medianIntervalMs={medianIntervalMs}
          rangeCoveragePct={rangeCoveragePct}
          lastHistoryPoint={lastHistoryPoint}
          hasSparseHistory={hasSparseHistory}
          historyChartData={historyChartData}
          historyYDomain={historyYDomain}
          formatHistoryTick={formatHistoryTick}
          globalBreakEven={globalBreakEven}
        />
      )}

      {activeTab === 'simulator' && (
        <Suspense fallback={<div className="card"><div className="loader"></div></div>}>
          <SimulatorTab
            consolidatedAssets={consolidatedAssets}
            targetPrices={targetPrices}
            handleTargetChange={handleTargetChange}
            eurRate={eurRate}
            simTotalProjected={simTotalProjected}
            simTotalProfit={simTotalProfit}
            simTotalCostBase={simTotalCostBase}
            simTaxUsd={simTaxUsd}
            simTotalNetPocketUsd={simTotalNetPocketUsd}
            simNetUsd={simNetUsd}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
