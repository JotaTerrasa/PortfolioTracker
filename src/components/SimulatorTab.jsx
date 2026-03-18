import React from 'react';
import { Rocket } from 'lucide-react';
import { COLORS, fmtEur, fmtNativeCurrency, fmtUsd } from '../lib/portfolioMath';

const SimulatorTab = ({ consolidatedAssets, targetPrices, handleTargetChange, eurRate, simTotalProjected, simTotalProfit, simTotalCostBase, simTaxUsd, simTotalNetPocketUsd, simNetUsd }) => {
  return (
    <div className="card">
      <div className="stat-label" style={{ marginBottom: '1.5rem', color: '#a5b4fc' }}>
        <Rocket size={18} /> Simulador de Objetivos
      </div>

      <div className="assets-table-container">
        <table className="simulator-table">
          <thead>
            <tr>
              <th>Activo / Cantidad</th>
              <th style={{ textAlign: 'center' }}>Coste Medio Spot</th>
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
              const isTargetValid = !Number.isNaN(targetVal) && targetVal > 0;
              const projectedValue = isTargetValid ? asset.amount * targetVal : 0;
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
                        <div className="coin-icon" style={{ background: `linear-gradient(135deg, ${COLORS[idx % COLORS.length]}, ${COLORS[idx % COLORS.length]}88)`, boxShadow: `0 4px 12px ${COLORS[idx % COLORS.length]}44` }}>
                          {asset.coin[0]}
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: 600 }}>{asset.coin}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{asset.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} tokens</div>
                        {asset.avgCost && asset.amount > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: '0.2rem', fontWeight: 600 }}>
                            Inv: {fmtUsd(asset.avgCost * asset.amount)}
                            {asset.avgCostCurrency && asset.avgCostCurrency !== 'USD' && asset.avgCostCurrency !== 'USDT'
                              ? ` | ${fmtNativeCurrency((asset.avgCostNative || 0) * asset.amount, asset.avgCostCurrency, eurRate)}`
                              : ` | ${fmtEur(asset.avgCost * asset.amount, eurRate)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td data-label="Precio Medio BE" style={{ textAlign: 'center' }}>
                    {asset.avgCost ? (
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{fmtUsd(asset.avgCost)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {asset.avgCostCurrency && asset.avgCostCurrency !== 'USD' && asset.avgCostCurrency !== 'USDT'
                            ? fmtNativeCurrency(asset.avgCostNative, asset.avgCostCurrency, eurRate)
                            : fmtEur(asset.avgCost, eurRate)}
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>N/A</span>}
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
                    ) : <span style={{ color: '#64748b' }}>Consultando API...</span>}
                  </td>
                  <td data-label="Precio Objetivo (USD)" style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <span style={{ color: '#94a3b8' }}>$</span>
                      <input type="number" className="sim-input" placeholder="Ej: 5.50" value={targetStr} onChange={(e) => handleTargetChange(asset.coin, e.target.value)} min="0" step="0.01" />
                    </div>
                  </td>
                  <td data-label="Capital Bruto Proyectado" style={{ textAlign: 'right' }}>
                    {isTargetValid ? (
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{fmtUsd(projectedValue)}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{fmtEur(projectedValue, eurRate)}</div>
                      </div>
                    ) : <span style={{ color: '#64748b' }}>-</span>}
                  </td>
                  <td data-label="Beneficio Limpio" style={{ textAlign: 'right' }}>
                    {isTargetValid && costBase > 0 ? (
                      <div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: profitIsPositive ? '#22c55e' : '#f43f5e' }}>{profitIsPositive ? '+' : ''}{fmtUsd(estimatedProfit)}</div>
                        <div style={{ color: profitIsPositive ? '#22c55e' : '#f43f5e', fontSize: '0.75rem' }}>{profitIsPositive ? '+' : ''}{fmtEur(estimatedProfit, eurRate)}</div>
                        <div style={{ color: profitIsPositive ? '#22c55e' : '#f43f5e', fontSize: '0.75rem', fontWeight: 700 }}>{profitIsPositive ? '+' : ''}{((estimatedProfit / costBase) * 100).toFixed(2)}%</div>
                      </div>
                    ) : <span style={{ color: '#64748b' }}>-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {simTotalProjected > 0 && (
            <tfoot className="simulator-summary" style={{ borderTop: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
              <tr className="sim-summary-row sim-summary-row-main">
                <td className="sim-summary-title" colSpan="5" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--text-main)', padding: '1.5rem 2rem' }}>GRAN TOTAL ESTIMADO:</td>
                <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem' }}>
                  <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Dinero total en el bolsillo</div>
                  <div style={{ fontWeight: 800, color: 'var(--text-main)', fontSize: '1.35rem' }}>{fmtUsd(simTotalProjected)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 600 }}>{fmtEur(simTotalProjected, eurRate)}</div>
                </td>
                <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem' }}>
                  <div style={{ color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Solo la ganancia extra</div>
                  <div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e' }}>{simTotalProfit >= 0 ? '+' : ''}{fmtUsd(simTotalProfit)}</div>
                    <div style={{ color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e', fontSize: '0.85rem' }}>{simTotalProfit >= 0 ? '+' : ''}{fmtEur(simTotalProfit, eurRate)}</div>
                    {simTotalCostBase > 0 && <div style={{ color: simTotalProfit >= 0 ? '#22c55e' : '#f43f5e', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.2rem' }}>{simTotalProfit >= 0 ? '+' : ''}{((simTotalProfit / simTotalCostBase) * 100).toFixed(2)}%</div>}
                  </div>
                </td>
              </tr>

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

              {simTotalProfit > 0 && (
                <tr className="sim-summary-row sim-summary-row-net" style={{ background: 'rgba(0,0,0,0.1)' }}>
                  <td className="sim-summary-spacer" colSpan="5" style={{ textAlign: 'right', borderBottom: 'none', padding: '1.5rem 2rem' }}></td>
                  <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem', borderBottom: 'none' }}>
                    <div style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Capital Total A Retirar (Neto)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-main)' }}>{fmtUsd(simTotalNetPocketUsd)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '1rem', fontWeight: 600 }}>{fmtEur(simTotalNetPocketUsd, eurRate)}</div>
                  </td>
                  <td className="sim-summary-metric" style={{ textAlign: 'right', padding: '1.5rem 2rem', borderBottom: 'none' }}>
                    <div style={{ color: 'var(--accent-secondary)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Beneficio Libre de Impuestos</div>
                    <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '0.75rem', padding: '0.75rem 1.25rem', display: 'inline-block' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#22c55e' }}>+{fmtUsd(simNetUsd)}</div>
                      <div style={{ color: '#22c55e', fontSize: '1rem', fontWeight: 700, marginTop: '0.1rem' }}>+{fmtEur(simNetUsd, eurRate)}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

export default SimulatorTab;
