# Crypto Portfolio Tracker

Dashboard full-stack para monitorizar un portfolio crypto en tiempo real, con:

- saldo consolidado (BingX + Bitpanda),
- distribución por activo,
- PnL total y por posición,
- histórico de valor persistente (SQLite local / Postgres en Vercel),
- simulador de objetivos con estimación de impuestos (IRPF España).

---

## Tabla de contenidos

- [Stack](#stack)
- [Arquitectura](#arquitectura)
- [Requisitos](#requisitos)
- [Instalación](#instalación)
- [Configuración de entorno](#configuración-de-entorno)
- [Scripts](#scripts)
- [API](#api)
- [Persistencia y snapshots](#persistencia-y-snapshots)
- [Flujo de datos](#flujo-de-datos)
- [Responsive y UX](#responsive-y-ux)
- [Limpieza del repositorio](#limpieza-del-repositorio)
- [Seguridad](#seguridad)
- [Troubleshooting](#troubleshooting)
- [Ideas de mejora](#ideas-de-mejora)

---

## Stack

### Frontend
- React 19 + Vite
- Recharts (gráficas)
- Lucide React (iconos)
- Axios

### Backend
- Node.js + Express
- `ccxt` (BingX)
- API Bitpanda (REST)
- SQLite (`sqlite3`) en local
- Neon Postgres (`@neondatabase/serverless`) en Vercel
- `node-cron` en local + Vercel Cron en producción

---

## Arquitectura

- `src/`:
  - `App.jsx`: UI principal, tabs Dashboard/Simulador, tablas y gráficas.
  - `index.css`: tema dark/light + responsive.
- `server.js`:
  - integra BingX/Bitpanda,
  - obtiene precios desde CoinGecko,
  - calcula valor, coste medio, PnL y métricas globales,
  - expone endpoints del frontend,
  - guarda snapshots en SQLite (local) o Postgres (Vercel).
- `portfolio.db`:
  - base local de desarrollo con tabla `snapshots`.

---

## Requisitos

- Node.js 18+ (recomendado 20 LTS)
- npm 9+
- Claves API válidas:
  - BingX (opcional)
  - Bitpanda (opcional)

Puedes arrancar con un solo exchange configurado.

---

## Instalación

```bash
npm install
cp .env.example .env
```

Edita `.env` con tus claves y configuración.

Arranque en desarrollo (frontend + backend):

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001` (o `SERVER_PORT`)

---

## Configuración de entorno

Archivo: `.env` (no debe subirse al repo).

Variables soportadas:

```dotenv
SERVER_PORT=3001
DATABASE_URL=postgres://...
CRON_SECRET=your_random_secret
BINGX_API_KEY=...
BINGX_SECRET_KEY=...
BITPANDA_API_KEY=...
```

Overrides opcionales de precio medio (cost basis manual):

```dotenv
BINGX_AVG_PRICE_<SYMBOL>=0
BITPANDA_AVG_PRICE_<SYMBOL>=0
```

Ejemplo:

```dotenv
BINGX_AVG_PRICE_ASTER=0.88
BITPANDA_AVG_PRICE_ASTER=1.85
```

---

## Scripts

- `npm run dev`: levanta Vite + backend en paralelo.
- `npm run server`: solo backend Express.
- `npm run build`: build de producción frontend.
- `npm run preview`: preview local del build.
- `npm run lint`: lint del proyecto.

---

## API

### `GET /api/balance`
Devuelve el estado completo del portfolio:

- activos por exchange,
- precio actual por activo,
- cambio 24h,
- icono y ATH de 1 año,
- coste medio y capital invertido (si disponible),
- PnL absoluto y porcentual,
- totales globales + EUR rate.

### `GET /api/history`
Devuelve snapshots de `total_usd` ordenados por tiempo para la gráfica histórica.

### `GET /api/snapshot`
Genera y persiste un snapshot manualmente.

- En Vercel se usa para ejecutar snapshots por cron.
- Si existe `CRON_SECRET`, requiere header `Authorization: Bearer <CRON_SECRET>`.

---

## Persistencia y snapshots

Se crea automáticamente la tabla:

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_usd REAL
);
```

Comportamiento:

- Local:
  - snapshot inicial si la tabla está vacía,
  - snapshot cada 10 minutos con `node-cron`,
  - persistencia en `portfolio.db`.
- Vercel:
  - persistencia en Postgres (`DATABASE_URL`),
  - snapshots cada 10 minutos vía `vercel.json` + `/api/snapshot`,
  - histórico durable entre ejecuciones serverless.

---

## Despliegue en Vercel (single deploy)

1. Conecta el repo a Vercel.
2. Añade integración de Postgres/Neon en el proyecto.
3. Define variables en Vercel:
   - `DATABASE_URL`
   - `CRON_SECRET` (recomendado)
   - `BINGX_API_KEY`
   - `BINGX_SECRET_KEY`
   - `BITPANDA_API_KEY`
   - (opcionales) `BINGX_AVG_PRICE_*`, `BITPANDA_AVG_PRICE_*`
4. Redeploy.
5. Comprueba endpoints:
   - `/api/balance`
   - `/api/history`
   - `/api/snapshot` (con token si usas `CRON_SECRET`)

---

## Flujo de datos

1. Backend obtiene balances de BingX/Bitpanda.
2. Se unifican símbolos y se consultan precios en CoinGecko.
3. Si falta precio, hay fallback a ticker del exchange.
4. Se calcula valor por activo y totales globales.
5. Se calcula coste medio desde histórico de compras (y/o overrides manuales).
6. Se calcula PnL por activo y PnL agregado.
7. Frontend renderiza cards, tablas, donut de distribución e histórico.

---

## Responsive y UX

La UI está adaptada para móvil/tablet:

- layout en una columna en breakpoints pequeños,
- gráfico de distribución con etiquetas y porcentajes legibles,
- tablas del dashboard y simulador en formato card en móvil,
- tabs con scroll horizontal en pantallas estrechas.

---

## Limpieza del repositorio

Se eliminaron artefactos temporales de auditoría y pruebas manuales (`*.mjs`, `*.txt` sueltos en raíz) para reducir ruido.

Además:

- se añadió `.env.example`,
- se fortaleció `.gitignore` para excluir secretos y DB local:
  - `.env`, `.env.*` (excepto `.env.example`),
  - `portfolio.db` y variantes,
  - `*.sqlite`, `*.sqlite3`.

---

## Seguridad

- Nunca subas `.env` al repositorio.
- Usa claves con permisos mínimos de lectura cuando sea posible.
- Si una clave se expuso, regénérala inmediatamente.
- Evita logs con datos sensibles (API keys, balances detallados en producción).

---

## Troubleshooting

### No aparece balance
- Verifica claves en `.env`.
- Comprueba que el backend corre en el puerto correcto.
- Revisa límites/rate limits de CoinGecko o exchange.

### Errores de CORS o conexión frontend-backend
- Arranca con `npm run dev` para levantar ambos servicios.
- Verifica que `server.js` está levantado y accesible.

### Valores de PnL extraños
- Revisa coste medio calculado desde histórico.
- Configura overrides `*_AVG_PRICE_*` si tu histórico no es completo.

### Histórico vacío
- Espera al primer cron o fuerza ejecución inicial reiniciando backend.
- Comprueba que `portfolio.db` es escribible.

---

## Ideas de mejora

- Export CSV/PDF de cartera e histórico.
- Alertas de precio/objetivo por activo.
- Autenticación para acceso al dashboard.
- Tests unitarios y e2e.
- Dockerfile + docker-compose para despliegue reproducible.
