# 3DTiles Web App

A React 19 frontend application for 3D visualization featuring Three.js and R3F.

## Environment Variables

This application supports environment variables for configuration. Here's how to set them up:

### Local Development

1. **Create a `.env` file** in the `apps/web` directory:

```bash
# apps/web/.env
VITE_API_URL=http://localhost:8787
VITE_ENVIRONMENT=development
VITE_CUSTOM_VAR=your_custom_value
```

2. **Access in your code**:

```typescript
// In any React component
const apiUrl = import.meta.env.VITE_API_URL;
const environment = import.meta.env.VITE_ENVIRONMENT;
const customVar = import.meta.env.VITE_CUSTOM_VAR;
```

### Production Deployment (Cloudflare Workers Builds)

For production deployment using Cloudflare Workers Builds, you can set environment variables in the Cloudflare dashboard:

1. **Go to Cloudflare Dashboard** → Workers & Pages
2. **Select your Worker** (3dtiles-web)
3. **Go to Settings** → **Environment variables**
4. **Add your variables** with the `VITE_` prefix:

```
VITE_API_URL=https://your-api-worker.your-subdomain.workers.dev
VITE_ENVIRONMENT=production
VITE_CUSTOM_VAR=production_value
```

### Important Notes

- **Prefix Required**: All environment variables must be prefixed with `VITE_` to be accessible in client-side code
- **Build-time Injection**: Environment variables are injected at build time, not runtime
- **Security**: Only `VITE_` prefixed variables are exposed to the client for security reasons
- **TypeScript Support**: Use `import.meta.env` to access environment variables with full TypeScript support

### Example Usage

```typescript
// In your React components
import { useEffect } from 'react';

export default function MyComponent() {
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL;
    const environment = import.meta.env.VITE_ENVIRONMENT;

    console.log(`Running in ${environment} mode`);
    console.log(`API URL: ${apiUrl}`);
  }, []);

  return <div>My Component</div>;
}
```

## Development

```bash
pnpm dev
```

## Build

```bash
pnpm build
```

## Deploy

```bash
pnpm deploy
```
