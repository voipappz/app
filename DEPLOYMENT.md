# Deployment Guide

## Production Deployment Process

This React application is designed to replace the existing Angular dashboard and be served via the main nginx configuration.

### 1. CI/CD Pipeline

The CircleCI pipeline automatically:
- ✅ Runs quality checks (ESLint, security audit)
- ✅ Executes E2E tests with Cypress
- ✅ Builds the production bundle (`npm run build`)
- ✅ Creates Docker image with nginx
- ✅ Pushes to Docker Hub: `${DOCKER_USER}/va-admin:latest`

### 2. nginx Configuration Update

**Updated nginx config location**: `/Users/voipappz/Projects/voipappz-api/config/nginx/nginx.conf`

**Key Changes Made**:
```nginx
# Line 181: Updated document root
root /usr/share/nginx/html/va-admin; # NEW React app

# Line 196: Enhanced CSP for React + Material-UI
add_header Content-Security-Policy "default-src 'self'...; connect-src 'self'... wss://yourdomain.com/cable...";

# Line 464: React Router SPA routing
try_files $uri$args $uri$args/ $uri $uri/ /index.html =404;
```

### 3. Docker Container Deployment

**Method 1: Docker Compose Update**
```yaml
services:
  nginx:
    volumes:
      # Replace Angular app volume with React app
      - va-admin-dist:/usr/share/nginx/html/va-admin:ro

  va-admin:
    image: nirlevi/va-admin:latest
    volumes:
      - va-admin-dist:/usr/share/nginx/html:ro
```

**Method 2: Direct Docker Volume**
```bash
# Pull latest image
docker pull nirlevi/va-admin:latest

# Create volume container
docker create --name va-admin-content nirlevi/va-admin:latest

# Copy files to nginx volume
docker cp va-admin-content:/usr/share/nginx/html/. /usr/share/nginx/html/va-admin/

# Clean up
docker rm va-admin-content
```

### 4. Environment Variables

**Required for CI/CD**:
- `DOCKER_USER`: Docker Hub username
- `DOCKER_PASS`: Docker Hub access token

**Runtime Configuration**:
- API endpoints: Handled by nginx proxy (routes `/api/*` to backend)
- WebSocket: Handled by nginx proxy (routes `/cable`, `/ws` to backend)

### 5. Verification Steps

**After deployment**:
1. ✅ Check nginx serves React app: `curl -I https://yourdomain.com/`
2. ✅ Verify API connectivity: Check Network tab for `/api` calls
3. ✅ Test WebSocket: Check for live data updates
4. ✅ Validate routing: Navigate to `/live`, `/calls` etc.
5. ✅ Mobile responsiveness: Test on different screen sizes

### 6. Rollback Process

**If issues occur**:
```bash
# Revert nginx config to Angular
sed -i 's|/usr/share/nginx/html/va-admin|/usr/share/nginx/html/dist/metronic|g' nginx.conf

# Restart nginx
nginx -s reload
```

### 7. Monitoring

**Key metrics to watch**:
- Response times for static assets
- API call success rates  
- WebSocket connection stability
- Bundle size impact on load times

---

## Technical Architecture

**Built with**:
- React 19 + Vite (fast builds)
- Material-UI v7 (modern components)
- React Router v7 (client-side routing)
- Axios (API calls)
- Native WebSocket (real-time updates)

**Bundle optimization**:
- Code splitting by feature area
- Tree shaking for smaller bundles
- Gzip compression via nginx
- Long-term browser caching headers