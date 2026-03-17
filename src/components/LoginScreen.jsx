import React from 'react';
import { ShieldCheck } from 'lucide-react';

const LoginScreen = ({ loginPassword, setLoginPassword, loginError, loading, handleLogin }) => {
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
};

export default LoginScreen;
