import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, RefreshCw, AlertCircle, Database, History,
  ArrowUp, ArrowDown, LayoutDashboard, Rocket, Target, Moon, Sun, ShieldCheck
} from 'lucide-react';
import axios from 'axios';

const COLORS = ['#6366f1', '#ec4899', '#8b5cf6', '#d946ef', '#f43f5e', '#f59e0b', '#10b981'];

const fmtUsd = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtEur = (v, rate) => `€${(v * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DualValue = ({ usd, rate, large, color }) => (
  <div>
    <span style={{
      fontSize: large ? '2rem' : 'inherit',
      fontWeight: large ? 700 : 600,
      color: color || '#f8fafc'
    }}>{fmtUsd(usd)}</span>
    <span style={{ color: '#94a3b8', fontSize: large ? '1.1rem' : '0.8rem', marginLeft: '0.5rem' }}>{fmtEur(usd, rate)}</span>
  </div>
);

const PnlBadge = ({ pnl, pnlPct, rate, showOnlyPct }) => {
  if (pnl === null || pnl === undefined) return <span style={{ color: '#64748b', fontSize: '0.8rem' }}>—</span>;
  const isPositive = pnl >= 0;
  const color = isPositive ? '#22c55e' : '#f43f5e';
  const sign = isPositive ? '+' : '';

  if (showOnlyPct) {
    return (
      <span style={{
        color,
        fontSize: '0.8rem',
        fontWeight: 700,
        backgroundColor: isPositive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
        padding: '0.2rem 0.5rem',
        borderRadius: '0.5rem',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.2rem'
      }}>
        {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        {Math.abs(pnlPct).toFixed(2)}%
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div style={{ color, fontWeight: 600 }}>
        {sign}{fmtUsd(pnl)}
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ color, fontSize: '0.75rem', opacity: 0.9 }}>{sign}{fmtEur(pnl, rate)}</span>
        <span style={{
          color,
          fontSize: '0.7rem',
          fontWeight: 700,
          backgroundColor: isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          padding: '0.1rem 0.4rem',
          borderRadius: '0.25rem'
        }}>
          {sign}{pnlPct?.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState('dashboard');
  const [targetPrices, setTargetPrices] = useState({});
  const [isLightMode, setIsLightMode] = useState(false);
  const authStorageKey = 'dashboard_auth_token';

  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
  }, [isLightMode]);

  const getAuthToken = () => window.localStorage.getItem(authStorageKey);
  const getAuthHeaders = () => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const checkAuthStatus = async () => {
    try {
      const statusRes = await axios.get('/api/auth/status', { headers: getAuthHeaders() });
      setAuthEnabled(Boolean(statusRes.data?.enabled));
      setIsAuthenticated(Boolean(statusRes.data?.authenticated));
      return statusRes.data;
    } catch {
      // Backward compatibility in case auth endpoint is not available
      setAuthEnabled(false);
      setIsAuthenticated(true);
      return { enabled: false, authenticated: true };
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceRes, historyRes] = await Promise.all([
        axios.get('/api/balance', { headers: getAuthHeaders() }),
        axios.get('/api/history', { headers: getAuthHeaders() })
      ]);
      setData(balanceRes.data);
      setHistory(historyRes.data);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (err?.response?.status === 401) {
        window.localStorage.removeItem(authStorageKey);
        setIsAuthenticated(false);
        setLoginError('Sesión expirada. Vuelve a iniciar sesión.');
        setError(null);
        return;
      }
      setError("Error al conectar con el servidor. Verifica que el backend esté funcionando.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { password: loginPassword });
      const token = res.data?.token;
      if (!token) throw new Error('No auth token returned');
      window.localStorage.setItem(authStorageKey, token);
      setLoginPassword('');
      setIsAuthenticated(true);
      await fetchData();
    } catch (err) {
      setLoginError(err?.response?.data?.error || 'No se pudo iniciar sesión.');
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
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
        <div className="card" style={{ width: '100%', maxWidth: '420px' }}>
          <div className="stat-label" style={{ marginBottom: '1rem' }}>
            <ShieldCheck size={18} /> Acceso Privado
          </div>
          <h2 style={{ marginBottom: '0.5rem' }}>Iniciar sesión</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Este dashboard requiere contraseña.
          </p>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <input
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Contraseña del dashboard"
              className="sim-input"
              style={{ width: '100%' }}
              autoFocus
              required
            />
            {loginError && <div style={{ color: '#f43f5e', fontSize: '0.85rem' }}>{loginError}</div>}
            <button type="submit" className="refresh-button" style={{ justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    );
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
    ...(data?.bingx.map(a => ({ ...a, exchange: 'BingX' })) || []),
    ...(data?.bitpanda.map(a => ({ ...a, exchange: 'Bitpanda' })) || [])
  ].sort((a, b) => b.value - a.value);

  const exchangeData = [
    { name: 'BingX', value: data?.bingx.reduce((sum, a) => sum + a.value, 0) || 0 },
    { name: 'Bitpanda', value: data?.bitpanda.reduce((sum, a) => sum + a.value, 0) || 0 }
  ];

  const groupedTokens = allAssets.reduce((acc, curr) => {
    acc[curr.coin] = (acc[curr.coin] || 0) + curr.value;
    return acc;
  }, {});

  const tokenDistributionData = Object.entries(groupedTokens)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const tokenDistributionTotal = tokenDistributionData.reduce((sum, item) => sum + item.value, 0);
  const tokenChartData = tokenDistributionData.map((item) => ({
    ...item,
    percentage: tokenDistributionTotal > 0 ? (item.value / tokenDistributionTotal) * 100 : 0
  }));
  const MIN_DONUT_LABEL_PERCENT = 3;
  const formatPercent = (value) => `${value.toFixed(1)}%`;

  const renderDistributionLabel = ({ cx, cy, midAngle, outerRadius, percent, fill }) => {
    const pct = percent * 100;
    if (pct < MIN_DONUT_LABEL_PERCENT) return null;

    const angle = (-midAngle * Math.PI) / 180;
    const labelRadius = outerRadius + 12;
    const x = cx + labelRadius * Math.cos(angle);
    const y = cy + labelRadius * Math.sin(angle);

    return (
      <text
        x={x}
        y={y}
        fill={fill}
        textAnchor={x > cx ? 'start' : 'end'}
        dominantBaseline="central"
        style={{ fontSize: '0.9rem', fontWeight: 700 }}
      >
        {formatPercent(pct)}
      </text>
    );
  };

  const totalPnl = data?.total_pnl || 0;
  const totalInvested = data?.total_invested || 0;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
  const pnlIsPositive = totalPnl >= 0;

  // Per-exchange invested capital breakdown
  const investedBingX = allAssets
    .filter(a => a.exchange === 'BingX')
    .reduce((sum, a) => sum + (a.invested || 0), 0);
  const investedBitpanda = allAssets
    .filter(a => a.exchange === 'Bitpanda')
    .reduce((sum, a) => sum + (a.invested || 0), 0);

  // Global Break-Even Calculation
  const globalBreakEven = allAssets.reduce((acc, a) => {
    if (a.avgCost) {
      if (!acc[a.coin]) acc[a.coin] = { totalCost: 0, totalAmount: 0 };
      acc[a.coin].totalCost += (a.invested || (a.avgCost * a.amount));
      acc[a.coin].totalAmount += a.amount;
    }
    return acc;
  }, {});

  Object.keys(globalBreakEven).forEach(coin => {
    const data = globalBreakEven[coin];
    globalBreakEven[coin] = data.totalCost / data.totalAmount;
  });

  // Calculate 24h portfolio change from asset data
  const totalChange24hUsd = allAssets.reduce((sum, a) => {
    const dailyChangeFactor = (a.change24h / 100);
    // Rough estimate: previous_price = current_price / (1 + change_factor)
    // change_usd = current_price * amount - (current_price/(1+change_factor)) * amount
    const prevValue = a.value / (1 + dailyChangeFactor);
    return sum + (a.value - prevValue);
  }, 0);
  const portfolioPrevValue = data?.total_usd - totalChange24hUsd;
  const totalChange24hPct = portfolioPrevValue > 0 ? (totalChange24hUsd / portfolioPrevValue) * 100 : 0;

  const historyChartData = history.map(h => ({
    time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    fullTime: new Date(h.timestamp).toLocaleString(),
    value: h.total_usd
  }));

  // Consolidated Assets for Simulator
  const consolidatedAssets = Object.keys(groupedTokens).map(coin => {
    const assets = allAssets.filter(a => a.coin === coin);
    const amount = assets.reduce((sum, a) => sum + a.amount, 0);
    const avgCost = globalBreakEven[coin] || (assets.find(a => a.avgCost)?.avgCost) || null;
    const price = assets[0]?.price || 0;
    const icon = assets[0]?.icon || null;
    const ath = assets[0]?.ath || 0;
    return { coin, amount, avgCost, price, icon, ath };
  }).sort((a, b) => (b.amount * b.price) - (a.amount * a.price));

  const handleTargetChange = (coin, val) => {
    setTargetPrices(prev => ({ ...prev, [coin]: val }));
  };

  let simTotalProjected = 0;
  let simTotalProfit = 0;
  let simTotalCostBase = 0;

  consolidatedAssets.forEach(asset => {
    const targetStr = targetPrices[asset.coin];
    const targetVal = parseFloat(targetStr);
    const isTargetValid = !isNaN(targetVal) && targetVal > 0;
    const costBase = asset.avgCost ? asset.avgCost * asset.amount : 0;

    if (isTargetValid) {
      const proj = asset.amount * targetVal;
      simTotalProjected += proj;
      if (costBase > 0) {
        simTotalCostBase += costBase;
        simTotalProfit += (proj - costBase);
      }
    }
  });

  const calculateTaxSpain = (profitUsd, rate) => {
    let profitEur = profitUsd * rate;
    if (profitEur <= 0) return 0;
    let taxEur = 0;
    let remaining = profitEur;

    if (remaining > 0) { const t = Math.min(remaining, 6000); taxEur += t * 0.19; remaining -= t; }
    if (remaining > 0) { const t = Math.min(remaining, 44000); taxEur += t * 0.21; remaining -= t; }
    if (remaining > 0) { const t = Math.min(remaining, 150000); taxEur += t * 0.23; remaining -= t; }
    if (remaining > 0) { const t = Math.min(remaining, 100000); taxEur += t * 0.27; remaining -= t; }
    if (remaining > 0) { taxEur += remaining * 0.28; }

    return taxEur / rate; // devuelto en USD
  };

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
          {authEnabled && (
            <button className="refresh-button" onClick={handleLogout}>
              Cerrar sesión
            </button>
          )}
          <button className="refresh-button" style={{ padding: '0.75rem' }} onClick={() => setIsLightMode(!isLightMode)}>
            {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="refresh-button" onClick={fetchData} disabled={loading}>
            {loading ? <div className="loader" style={{ width: 14, height: 14 }}></div> : <RefreshCw size={16} />}
            {loading ? 'Sincronizando...' : 'Actualizar'}
          </button>
        </div>
      </header>

      {error && (
        <div className="card" style={{ marginBottom: '2rem', borderColor: '#f43f5e', background: 'rgba(244, 63, 94, 0.1)' }}>
          <div className="stat-label" style={{ color: '#f43f5e' }}>
            <AlertCircle size={18} /> Error de Conexión
          </div>
          <p style={{ fontSize: '0.875rem' }}>{error}</p>
        </div>
      )}

      <div className="tabs-container">
        <button className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          <LayoutDashboard size={18} /> Dashboard
        </button>
        <button className={`tab ${activeTab === 'simulator' ? 'active' : ''}`} onClick={() => setActiveTab('simulator')}>
          <Rocket size={18} /> Simulador
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div className="stats-grid">
            <div className="card hero-card hero-balance-card" style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="stat-label">
                  <TrendingUp size={18} /> Mi Balance de Mercado
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <DualValue usd={data?.total_usd || 0} rate={eurRate} large />
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: totalChange24hUsd >= 0 ? '#22c55e' : '#f43f5e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      {totalChange24hUsd >= 0 ? '+' : ''}{totalChange24hPct.toFixed(2)}%
                      {totalChange24hUsd >= 0 ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Últimas 24h ({totalChange24hUsd >= 0 ? '+' : ''}{fmtUsd(totalChange24hUsd)})</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="stat-label" style={{ color: pnlIsPositive ? '#22c55e' : '#f43f5e' }}>
                {pnlIsPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />} P&L Latente
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: pnlIsPositive ? '#22c55e' : '#f43f5e' }}>
                    {pnlIsPositive ? '+' : ''}{fmtUsd(totalPnl)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{pnlIsPositive ? '+' : ''}{fmtEur(totalPnl, eurRate)}</div>
                </div>
                <div style={{
                  color: pnlIsPositive ? '#22c55e' : '#f43f5e',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  backgroundColor: pnlIsPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '0.5rem'
                }}>
                  {pnlIsPositive ? '+' : ''}{totalPnlPct.toFixed(2)}%
                </div>
              </div>
            </div>

            <div className="card">
              <div className="stat-label">
                <Wallet size={18} /> Capital Invertido
              </div>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {fmtUsd(totalInvested)}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  {fmtEur(totalInvested, eurRate)}
                </div>

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#a5b4fc', fontSize: '0.75rem' }}>BingX:</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmtUsd(investedBingX)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{fmtEur(investedBingX, eurRate)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#f9a8d4', fontSize: '0.75rem' }}>Bitpanda:</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{fmtUsd(investedBitpanda)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>{fmtEur(investedBitpanda, eurRate)}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="chart-section main-chart-section">
            <div className="card chart-card history-chart-card">
              <div className="stat-label" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <History size={18} /> Histórico de Valor
              </div>
              <ResponsiveContainer width="100%" height="80%">
                <AreaChart data={historyChartData}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickMargin={10} />
                  <YAxis
                    stroke="rgba(148, 163, 184, 0.9)"
                    tick={{ fill: 'rgba(148, 163, 184, 0.95)', fontSize: 11 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', color: 'var(--text-main)', backdropFilter: 'blur(10px)' }}
                    itemStyle={{ color: 'var(--text-main)' }}
                    labelStyle={{ color: 'var(--text-muted)', marginBottom: '8px' }}
                    formatter={(value) => [fmtUsd(value), 'Valor Portfolio']}
                    labelFormatter={(label, payload) => payload[0]?.payload?.fullTime}
                  />
                  <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card chart-card donut-chart-card">
              <div className="stat-label" style={{ marginBottom: '1.5rem' }}>Distribución de Capital</div>
              <ResponsiveContainer width="100%" height="80%">
                <PieChart>
                  <Pie
                    data={tokenChartData}
                    cx="50%"
                    cy="54%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                    labelLine={false}
                    label={renderDistributionLabel}
                  >
                    {tokenChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, entry) => [`${fmtUsd(value)} (${formatPercent(entry?.payload?.percentage || 0)})`, name]}
                    contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-main)', backdropFilter: 'blur(10px)' }}
                    itemStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: '16px', fontSize: '0.86rem' }}
                    iconSize={11}
                    formatter={(value, entry) => `${value} (${formatPercent(entry?.payload?.percentage || 0)})`}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="assets-table-container card" style={{ padding: '0', border: 'none' }}>
            <table className="asset-table" style={{ margin: '0' }}>
              <thead>
                <tr>
                  <th>Activo</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Precio Medio</th>
                  <th style={{ textAlign: 'center' }}>24h %</th>
                  <th style={{ textAlign: 'right' }}>Valor Total</th>
                  <th style={{ textAlign: 'right' }}>P&L (Mkt)</th>
                  <th style={{ textAlign: 'right' }}>Exchange</th>
                </tr>
              </thead>
              <tbody>
                {allAssets.map((asset, idx) => (
                  <tr key={`${asset.exchange}-${asset.coin}-${idx}`}>
                    <td data-label="Activo">
                      <div className="coin-cell">
                        {asset.icon ? (
                          <img src={asset.icon} alt={asset.coin} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                        ) : (
                          <div className="coin-icon" style={{
                            background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}, ${COLORS[idx % COLORS.length]}88)`,
                            boxShadow: `0 4px 12px ${COLORS[idx % COLORS.length]}44`
                          }}>
                            {asset.coin[0]}
                          </div>
                        )}
                        <div>
                          <div style={{ fontWeight: 600 }}>{asset.coin}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Crypto Asset</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Cantidad" style={{ textAlign: 'right', fontWeight: 500 }}>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td data-label="Precio" style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>{fmtUsd(asset.price)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{fmtEur(asset.price, eurRate)}</div>
                    </td>
                    <td data-label="Precio Medio" style={{ textAlign: 'right' }}>
                      {asset.avgCost ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                          <div style={{ fontWeight: 600, color: '#94a3b8' }}>{fmtUsd(asset.avgCost)}</div>
                          <div style={{ color: '#475569', fontSize: '0.75rem' }}>{fmtEur(asset.avgCost, eurRate)}</div>
                          {globalBreakEven[asset.coin] && allAssets.filter(a => a.coin === asset.coin).length > 1 && (
                            <div style={{
                              marginTop: '0.4rem',
                              padding: '0.1rem 0.4rem',
                              borderRadius: '0.4rem',
                              background: 'rgba(99, 102, 241, 0.1)',
                              border: '1px solid rgba(99, 102, 241, 0.3)',
                              fontSize: '0.65rem',
                              color: '#a5b4fc',
                              fontWeight: 700,
                              textAlign: 'center'
                            }}>
                              GLOBAL BE: {fmtUsd(globalBreakEven[asset.coin])}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#64748b', fontSize: '0.8rem' }}>N/A</span>
                      )}
                    </td>
                    <td data-label="24h %" style={{ textAlign: 'center' }}>
                      <PnlBadge pnl={asset.change24h} pnlPct={asset.change24h} showOnlyPct />
                    </td>
                    <td data-label="Valor Total" style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700 }}>{fmtUsd(asset.value)}</div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{fmtEur(asset.value, eurRate)}</div>
                    </td>
                    <td data-label="P&L (Mkt)" style={{ textAlign: 'right' }}>
                      <PnlBadge pnl={asset.pnl} pnlPct={asset.pnlPct} rate={eurRate} />
                    </td>
                    <td data-label="Exchange" style={{ textAlign: 'right' }}>
                      <span style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '0.75rem',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background: asset.exchange === 'BingX' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(236, 72, 153, 0.15)',
                        color: asset.exchange === 'BingX' ? '#a5b4fc' : '#f9a8d4',
                        border: `1px solid ${asset.exchange === 'BingX' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(236, 72, 153, 0.2)'}`
                      }}>
                        {asset.exchange}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'simulator' && (
        <div className="card">
          <div className="stat-label" style={{ marginBottom: '1.5rem', color: '#a5b4fc' }}>
            <Rocket size={18} /> Simulador de Objetivos
          </div>

          <div className="assets-table-container">
            <table className="simulator-table">
              <thead>
                <tr>
                  <th>Activo / Cantidad</th>
                  <th style={{ textAlign: 'center' }}>Precio Medio BE</th>
                  <th style={{ textAlign: 'center' }}>Precio Actual</th>
                  <th style={{ textAlign: 'center' }}>Máximo (1 Año)</th>
                  <th style={{ textAlign: 'center' }}>Precio Objetivo (USD)</th>
                  <th style={{ textAlign: 'right' }}>Capital Bruto Proyectado<br /><span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)' }}>(Capital Inicial + Ganancias)</span></th>
                  <th style={{ textAlign: 'right' }}>Beneficio Limpio<br /><span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--text-muted)' }}>(Ganancia extra descontando la inversión)</span></th>
                </tr>
              </thead>
              <tbody>
                {consolidatedAssets.map((asset, idx) => {
                  const targetStr = targetPrices[asset.coin] !== undefined ? targetPrices[asset.coin] : '';
                  const targetVal = parseFloat(targetStr);

                  // Projected calculations
                  const isTargetValid = !isNaN(targetVal) && targetVal > 0;
                  const projectedValue = isTargetValid ? asset.amount * targetVal : 0;

                  // Profit based on global BE
                  const costBase = asset.avgCost ? asset.avgCost * asset.amount : 0;
                  const estimatedProfit = isTargetValid && costBase > 0 ? projectedValue - costBase : 0;
                  const profitIsPositive = estimatedProfit >= 0;

                  return (
                    <tr key={`sim-${asset.coin}`}>
                      <td data-label="Activo / Cantidad">
                        <div className="coin-cell">
                          {asset.icon ? (
                            <img src={asset.icon} alt={asset.coin} style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                          ) : (
                            <div className="coin-icon" style={{
                              background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}, ${COLORS[idx % COLORS.length]}88)`,
                              boxShadow: `0 4px 12px ${COLORS[idx % COLORS.length]}44`
                            }}>
                              {asset.coin[0]}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{asset.coin}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens</div>
                            {asset.avgCost && asset.amount > 0 && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: '0.2rem', fontWeight: 600 }}>
                                Inv: {fmtUsd(asset.avgCost * asset.amount)} | {fmtEur(asset.avgCost * asset.amount, eurRate)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Precio Medio BE" style={{ textAlign: 'center' }}>
                        {asset.avgCost ? (
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{fmtUsd(asset.avgCost)}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtEur(asset.avgCost, eurRate)}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>N/A</span>
                        )}
                      </td>
                      <td data-label="Precio Actual" style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{fmtUsd(asset.price)}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{fmtEur(asset.price, eurRate)}</div>
                      </td>
                      <td data-label="Máximo (1 Año)" style={{ textAlign: 'center' }}>
                        {asset.ath > 0 ? (
                          <div>
                            <div style={{ fontWeight: 600, color: '#f59e0b' }}>
                              <span>{fmtUsd(asset.ath)}</span>
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.75rem', color: '#64748b' }}>{fmtEur(asset.ath, eurRate)}</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              {-((1 - (asset.price / asset.ath)) * 100).toFixed(1)}% desde su máximo
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b' }}>Consultando API...</span>
                        )}
                      </td>
                      <td data-label="Precio Objetivo (USD)" style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#94a3b8' }}>$</span>
                          <input
                            type="number"
                            className="sim-input"
                            placeholder="Ej: 5.50"
                            value={targetStr}
                            onChange={(e) => handleTargetChange(asset.coin, e.target.value)}
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </td>
                      <td data-label="Capital Bruto Proyectado" style={{ textAlign: 'right' }}>
                        {isTargetValid ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmtUsd(projectedValue)}</div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{fmtEur(projectedValue, eurRate)}</div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b' }}>-</span>
                        )}
                      </td>
                      <td data-label="Beneficio Limpio" style={{ textAlign: 'right' }}>
                        {isTargetValid && costBase > 0 ? (
                          <div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: profitIsPositive ? '#22c55e' : '#f43f5e' }}>
                              {profitIsPositive ? '+' : ''}{fmtUsd(estimatedProfit)}
                            </div>
                            <div style={{ color: profitIsPositive ? '#22c55e' : '#f43f5e', fontSize: '0.75rem' }}>
                              {profitIsPositive ? '+' : ''}{fmtEur(estimatedProfit, eurRate)}
                            </div>
                            <div style={{ color: profitIsPositive ? '#22c55e' : '#f43f5e', fontSize: '0.75rem', fontWeight: 700 }}>
                              {profitIsPositive ? '+' : ''}{((estimatedProfit / costBase) * 100).toFixed(2)}%
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b' }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {simTotalProjected > 0 && (
                <tfoot className="simulator-summary" style={{
                  borderTop: '2px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.02)'
                }}>
                  <tr className="sim-summary-row sim-summary-row-main">
                    <td className="sim-summary-title" colSpan="5" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-main)', padding: '1.5rem 2rem' }}>
                      GRAN TOTAL ESTIMADO:
                    </td>
                    <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem' }}>
                      <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Dinero total en el bolsillo</div>
                      <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.35rem' }}>{fmtUsd(simTotalProjected)}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{fmtEur(simTotalProjected, eurRate)}</div>
                    </td>
                    <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem' }}>
                      <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Solo la ganancia extra</div>
                      <div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e' }}>
                          {simTotalProfit >= 0 ? '+' : ''}{fmtUsd(simTotalProfit)}
                        </div>
                        <div style={{ color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e', fontSize: '0.85rem' }}>
                          {simTotalProfit >= 0 ? '+' : ''}{fmtEur(simTotalProfit, eurRate)}
                        </div>
                        {simTotalCostBase > 0 && (
                          <div style={{ color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.2rem' }}>
                            {simTotalProfit >= 0 ? '+' : ''}{((simTotalProfit / simTotalCostBase) * 100).toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* FILA DE IMPUESTOS */}
                  {simTaxUsd > 0 && (
                    <tr className="sim-summary-row sim-summary-row-tax" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td className="sim-summary-title" colSpan="6" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)', padding: '1.25rem 2rem', borderBottom: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          <span>IMPUESTOS (IRPF ESPAÑA):</span>
                          <span style={{ fontSize: '0.75rem', background: 'var(--border-color)', padding: '0.1rem 0.5rem', borderRadius: '0.2rem' }}>19% - 28% progresivo</span>
                        </div>
                      </td>
                      <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.25rem 2rem', borderBottom: 'none' }}>
                        <div style={{ color: 'var(--danger)', fontWeight: 700, fontSize: '1.1rem' }}>-{fmtUsd(simTaxUsd)}</div>
                        <div style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>-{fmtEur(simTaxUsd, eurRate)}</div>
                      </td>
                    </tr>
                  )}

                  {/* BENEFICIO NETO FINAL */}
                  {simTotalProfit > 0 && (
                    <tr className="sim-summary-row sim-summary-row-net" style={{ background: 'rgba(0,0,0,0.1)' }}>
                      <td className="sim-summary-spacer" colSpan="5" style={{ textAlign: 'right', borderBottom: 'none', padding: '1.5rem 2rem' }}></td>
                      <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem', borderBottom: 'none' }}>
                        <div style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                          Capital Total A Retirar (Neto)
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)' }}>
                          {fmtUsd(simTotalNetPocketUsd)}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>
                          {fmtEur(simTotalNetPocketUsd, eurRate)}
                        </div>
                      </td>
                      <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem', borderBottom: 'none' }}>
                        <div style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                          Beneficio Libre de Impuestos
                        </div>
                        <div style={{
                          background: 'rgba(34, 197, 94, 0.1)',
                          border: '1px solid rgba(34, 197, 94, 0.3)',
                          borderRadius: '0.75rem',
                          padding: '0.75rem 1.25rem',
                          display: 'inline-block'
                        }}>
                          <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#22c55e' }}>
                            +{fmtUsd(simNetUsd)}
                          </div>
                          <div style={{ color: '#22c55e', fontSize: '1rem', fontWeight: 700, marginTop: '0.1rem' }}>
                            +{fmtEur(simNetUsd, eurRate)}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
