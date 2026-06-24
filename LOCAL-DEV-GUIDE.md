# VoipAppZ Local Development Setup Guide

Complete guide to running the full application stack locally with Docker Compose.

## 1. Required Environment Variables

Add these to your `.env` file (copy from `.env.example` if starting fresh):

```bash
# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# DocuSeal e-signing (required for PDF signing)
DOCUSEAL_API_KEY=your-docuseal-api-key

# ngrok (required for webhooks in local dev)
NGROK_AUTHTOKEN=your-ngrok-auth-token
```

### Where to get these:
- **Supabase keys**: https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
- **DocuSeal API key**: https://console.docuseal.eu/api
- **ngrok auth token**: https://dashboard.ngrok.com/get-started/your-authtoken

---

## 2. Start All Services

```bash
# Start core services
sudo docker-compose up -d react-app deno-api pdf-api

# Start ngrok for webhooks (required for DocuSeal callbacks)
sudo docker-compose up -d --scale ngrok=1 ngrok
```

**Check all services are running:**
```bash
sudo docker-compose ps
```

Expected output - all should show `Up`:
```
telecom-sales-app_deno-api_1    Up    0.0.0.0:3000->3000/tcp
telecom-sales-app_pdf-api_1     Up
telecom-sales-app_react-app_1   Up    0.0.0.0:5173->5173/tcp
telecom-sales-app_ngrok_1       Up    0.0.0.0:4040->4040/tcp
```

---

## 3. Configure DocuSeal Webhook

> **Important:** You need to reconfigure the webhook URL every time ngrok restarts because the free plan gives a new random URL each time. To avoid this, upgrade to ngrok paid plan for a static domain.

### Steps:
1. Open http://localhost:4040 - copy the public URL (e.g., `https://abc123.ngrok-free.app`)
2. Go to https://console.docuseal.eu/webhooks
3. Add/update webhook URL: `https://YOUR-NGROK-URL/webhook/docuseal`
4. Select event: `form.completed`
5. Save

### Why `form.completed` and not `submission.completed`?

| Event | Trigger | Payload |
|-------|---------|---------|
| `form.completed` | Single signer completes | Contains `documents[].url` with signed PDF |
| `submission.completed` | All signers complete | Contains `submitters[]` array, different structure |

The app uses `form.completed` because:
- It includes the signed document URL directly in `payload.data.documents[0].url`
- Works for single-signer workflows (customer signs)
- The backend code (`docuseal_service.ts`) expects this payload structure

---

## 4. Access the App

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:5173 | React application |
| API Health | http://localhost:3000/test | Deno API status |
| ngrok Dashboard | http://localhost:4040 | View webhook requests |

---

## 5. Monitor Logs

```bash
# All services at once (recommended)
sudo docker-compose logs -f deno-api pdf-api ngrok

# Individual services
sudo docker-compose logs -f deno-api
sudo docker-compose logs -f pdf-api
sudo docker-compose logs -f ngrok
sudo docker-compose logs -f react-app

# Last N lines only
sudo docker-compose logs --tail=50 deno-api

# Save logs to file
sudo docker-compose logs deno-api > deno-api.log
```

---

## 6. Restart Services

After changing `.env` variables, you **must** use `--force-recreate`:

```bash
# Restart API services with new env vars
sudo docker-compose up -d --force-recreate deno-api pdf-api

# Restart ngrok
sudo docker-compose up -d --force-recreate --scale ngrok=1 ngrok

# Restart everything
sudo docker-compose up -d --force-recreate
```

> **Note:** `docker-compose restart` does NOT reload `.env` changes. Always use `--force-recreate`.

---

## 7. Stop Everything

```bash
# Stop all services
sudo docker-compose down

# Stop and remove volumes (clean slate)
sudo docker-compose down -v
```

---

## 8. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `401 Unauthorized` on API calls | JWT token not sent | Fixed in `httpClient.ts` - uses Supabase session |
| `503 Service Unavailable` on `/sign_pdf` | `DOCUSEAL_API_KEY` not set | Add key to `.env`, restart deno-api |
| `502 Bad Gateway` on ngrok | deno-api not running | Check `docker-compose ps`, restart deno-api |
| Deno panic / crash | Docker seccomp restrictions | `security_opt: seccomp=unconfined` added to docker-compose.yml |
| Port already in use | Old container or process | `sudo fuser -k PORT/tcp` then restart |
| Webhook returns 401 | Wrong path configured | Ensure URL ends with `/webhook/docuseal` |
| `.env` changes not applied | Containers not recreated | Use `--force-recreate` flag |

### Checking what's using a port:
```bash
sudo lsof -i :3000
sudo lsof -i :4040
sudo lsof -i :5173
```

### Killing a process on a port:
```bash
sudo fuser -k 3000/tcp
sudo fuser -k 4040/tcp
```

---

## 9. Service Architecture

```
Browser (localhost:5173)
    │
    ├── React App (Vite dev server)
    │       │
    │       └── /apps/* proxy ──► deno-api (port 3000)
    │                                   │
    │                                   └──► pdf-api (port 8001, internal only)
    │
    └── DocuSeal webhook ──► ngrok ──► deno-api /webhook/docuseal
```

---

## 10. Quick Reference Commands

```bash
# Start everything
sudo docker-compose up -d react-app deno-api pdf-api
sudo docker-compose up -d --scale ngrok=1 ngrok

# Check status
sudo docker-compose ps

# View logs
sudo docker-compose logs -f deno-api pdf-api ngrok

# Restart after .env change
sudo docker-compose up -d --force-recreate deno-api pdf-api

# Stop everything
sudo docker-compose down

# Enter a container
sudo docker-compose exec deno-api sh
sudo docker-compose exec react-app bash
```
