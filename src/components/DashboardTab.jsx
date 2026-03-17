import React from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Treemap, LineChart, Line,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, History,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import { COLORS, fmtDateTime, fmtDurationCompact, fmtEur, fmtSignedPct, fmtUsd } from '../lib/portfolioMath';

const DualValue = ({ usd, rate, large, color }) => (
  <div>
    <span style={{
      fontSize: large ? '2rem' : 'inherit',
      fontWeight: large ? 700 : 600,
      color: color || '#f8fafc',
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
        gap: '0.2rem',
      }}>
        {isPositive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
        {Math.abs(pnlPct).toFixed(2)}%
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <div style={{ color, fontWeight: 600 }}>{sign}{fmtUsd(pnl)}</div>
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ color, fontSize: '0.75rem', opacity: 0.9 }}>{sign}{fmtEur(pnl, rate)}</span>
        <span style={{
          color,
          fontSize: '0.7rem',
          fontWeight: 700,
          backgroundColor: isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(244, 63, 94, 0.15)',
          padding: '0.1rem 0.4rem',
          borderRadius: '0.25rem',
        }}>
          {sign}{pnlPct?.toFixed(2)}%
        </span>
      </div>
    </div>
  );
};

const DashboardTab = ({
  data,
  eurRate,
  isMobile,
  historyRange,
  setHistoryRange,
  allAssets,
  tokenTreemapData,
  renderTreemapNode,
  totalChange24hUsd,
  totalChange24hPct,
  totalPnl,
  totalPnlPct,
  pnlIsPositive,
  totalInvested,
  investedBingX,
  investedBitpanda,
  historyForChart,
  historySpanMs,
  medianIntervalMs,
  rangeCoveragePct,
  lastHistoryPoint,
  hasSparseHistory,
  historyChartData,
  historyYDomain,
  formatHistoryTick,
  globalBreakEven,
}) => {
  const formatPercent = (value) => `${value.toFixed(1)}%`;

  return (
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
              borderRadius: '0.5rem',
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
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{fmtUsd(totalInvested)}</div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{fmtEur(totalInvested, eurRate)}</div>
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
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div className="stat-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <History size={18} /> Histórico de Valor
            </div>
            <div className="history-range-controls">
              {['24h', '7d', '30d', 'all'].map((range) => (
                <button
                  key={range}
                  className={`history-range-btn ${historyRange === range ? 'active' : ''}`}
                  onClick={() => setHistoryRange(range)}
                  type="button"
                >
                  {range}
                </button>
              ))}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', width: '100%' }}>
              {historyForChart.length} muestras
              {historySpanMs ? ` · cobertura ${fmtDurationCompact(historySpanMs)}` : ''}
              {medianIntervalMs ? ` · intervalo mediano ${fmtDurationCompact(medianIntervalMs)}` : ''}
              {rangeCoveragePct !== null ? ` · ${rangeCoveragePct}% del rango` : ''}
              {lastHistoryPoint ? ` · último: ${fmtDateTime(lastHistoryPoint.timestamp)}` : ''}
            </div>
            {historyForChart.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', width: '100%' }}>No hay snapshots dentro de este rango todavía.</div>}
            {hasSparseHistory && <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', width: '100%' }}>Muy pocos snapshots en este rango. El gráfico mejora automáticamente conforme se guardan más muestras.</div>}
          </div>
          <ResponsiveContainer width="100%" height="80%">
            <LineChart data={historyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="timestamp" type="number" scale="time" domain={['dataMin', 'dataMax']} stroke="#64748b" fontSize={11} tickMargin={10} tickFormatter={formatHistoryTick} tickCount={6} minTickGap={28} interval="preserveStartEnd" />
              <YAxis stroke="rgba(148, 163, 184, 0.9)" tick={{ fill: 'rgba(148, 163, 184, 0.95)', fontSize: 11 }} domain={historyYDomain} tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} />
              <Tooltip contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px', color: 'var(--text-main)', backdropFilter: 'blur(10px)' }} itemStyle={{ color: 'var(--text-main)' }} labelStyle={{ color: 'var(--text-muted)', marginBottom: '8px' }} formatter={(value) => [fmtUsd(value), 'Valor Portfolio']} labelFormatter={(label) => fmtDateTime(label)} />
              <Line type="monotoneX" dataKey="value" stroke="#6366f1" strokeWidth={2.8} dot={{ r: 3, strokeWidth: 0, fill: '#818cf8' }} activeDot={{ r: 4, strokeWidth: 0, fill: '#c7d2fe' }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-card donut-chart-card">
          <div className="stat-label" style={{ marginBottom: '1.5rem' }}>Distribución de Capital</div>
          <ResponsiveContainer width="100%" height={isMobile ? '86%' : '82%'}>
            <Treemap data={tokenTreemapData} dataKey="value" ratio={4 / 3} stroke="rgba(255,255,255,0.08)" isAnimationActive={false} content={renderTreemapNode}>
              <Tooltip
                formatter={(value, name, entry) => [
                  `${fmtUsd(value)} · ${formatPercent(entry?.payload?.percentage || 0)} · ${fmtSignedPct(entry?.payload?.change24h || 0)}`,
                  name,
                ]}
                contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-main)', backdropFilter: 'blur(10px)' }}
                itemStyle={{ color: 'var(--text-main)', fontWeight: 600 }}
              />
            </Treemap>
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
                      <div className="coin-icon" style={{ background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}, ${COLORS[idx % COLORS.length]}88)`, boxShadow: `0 4px 12px ${COLORS[idx % COLORS.length]}44` }}>
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
                      {globalBreakEven[asset.coin] && allAssets.filter((a) => a.coin === asset.coin).length > 1 && (
                        <div style={{ marginTop: '0.4rem', padding: '0.1rem 0.4rem', borderRadius: '0.4rem', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', fontSize: '0.65rem', color: '#a5b4fc', fontWeight: 700, textAlign: 'center' }}>
                          GLOBAL BE: {fmtUsd(globalBreakEven[asset.coin])}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#64748b', fontSize: '0.8rem' }}>N/A</span>
                  )}
                </td>
                <td data-label="24h %" style={{ textAlign: 'center' }}><PnlBadge pnl={asset.change24h} pnlPct={asset.change24h} showOnlyPct /></td>
                <td data-label="Valor Total" style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>{fmtUsd(asset.value)}</div>
                  <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{fmtEur(asset.value, eurRate)}</div>
                </td>
                <td data-label="P&L (Mkt)" style={{ textAlign: 'right' }}><PnlBadge pnl={asset.pnl} pnlPct={asset.pnlPct} rate={eurRate} /></td>
                <td data-label="Exchange" style={{ textAlign: 'right' }}>
                  <span style={{ padding: '0.4rem 0.75rem', borderRadius: '0.75rem', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', background: asset.exchange === 'BingX' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(236, 72, 153, 0.15)', color: asset.exchange === 'BingX' ? '#a5b4fc' : '#f9a8d4', border: `1px solid ${asset.exchange === 'BingX' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(236, 72, 153, 0.2)'}` }}>
                    {asset.exchange}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default DashboardTab;
