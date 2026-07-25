# MKZ Factory Monitor Frontend

React TypeScript frontend for on-premise factory monitoring. The frontend communicates with the ASP.NET Core backend through REST APIs today and is being hardened for shared enterprise deployment.

## Stack

- React
- TypeScript
- Vite
- React Router
- TanStack React Query
- Zustand
- Axios
- React Hook Form
- Zod
- Recharts
- Tailwind CSS
- Lucide React

## Environment

Create `.env.local` for local development:

```env
VITE_API_URL=/api
VITE_CEP_API_URL=/api/cep
VITE_ASSET_API_URL=/api/asset-service
```

In production, point these paths at the backend, CEP, and asset-service routes served inside the factory network. Direct CEP/asset-service URLs must include `/api/v1`; the Vite development server proxies the defaults to ports 8085 and 8084.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

## Current structure

- `src/app`: query client, query keys, permissions
- `src/api`: REST clients and API error normalization
- `src/components`: shared layout, auth, error, and UI primitives
- `src/pages`: current route pages being migrated incrementally
- `src/store`: Zustand stores
- `src/types`: shared domain types

See `AUDIT.md` for the current frontend audit and the next hardening phases.

## Current implementation notes

- Production lines are being unified under `src/api/lines.api.ts`
- The selected line is moving away from a fixed UUID toward URL-backed selection
- Default credentials are intentionally not shown in the login UI
- External CDN fonts are not allowed in production
