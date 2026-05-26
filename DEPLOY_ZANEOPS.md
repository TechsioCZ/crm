# ZaneOps deployment (CRM)

Tento projekt je pripraveny pro deployment do ZaneOps pres **Dockerfile builder** se samostatnymi sluzbami `backend` a `frontend` (obe Alpine-based image).

## 1) Backend service

- Builder: `Dockerfile`
- Build context directory: `backend`
- Dockerfile path: `backend/Dockerfile`
- Healthcheck path v ZaneOps: `/api/health`
- Internal port: `PORT` (default v aplikaci je `4000`)

Povinne env promenne:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET` (min 24 znaku)
- `JWT_REFRESH_SECRET` (min 24 znaku)

Doporucene env promenne:

- `PORT=4000`
- `CORS_ORIGIN=https://<frontend-domain>`
- `ACCESS_TOKEN_TTL=15m`
- `REFRESH_TOKEN_TTL=7d`

## 2) Frontend service

- Builder: `Dockerfile`
- Build context directory: `frontend`
- Dockerfile path: `frontend/Dockerfile`
- Healthcheck path v ZaneOps: `/health`

Povinna env promenna:

- `VITE_API_BASE_URL=https://<backend-domain>`

Poznamka:
- Frontend image pouziva `nginx:alpine` a posloucha na `${PORT}` (default `8080`), takze funguje i s dynamickym portem v platforme.

## 3) Databaze

V ZaneOps vytvor PostgreSQL service (template nebo vlastni image) a nastav `DATABASE_URL` pro backend.

Jednorazove po prvnim deploy spust migrace z repozitare (lokalne nebo v CI) proti stejne `DATABASE_URL`:

```bash
cd backend
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Volitelne seed:

```bash
cd backend
DATABASE_URL="postgresql://..." npx prisma db seed
```

## 4) Doporucena sitova konfigurace

- Frontend publikuj na root domenu (napr. `https://crm.example.com`)
- Backend publikuj na samostatnou domenu/subdomenu (napr. `https://api.crm.example.com`)

Pak nastav:

- `VITE_API_BASE_URL=https://api.crm.example.com`
- `CORS_ORIGIN=https://crm.example.com`

## 5) Auto-deploy

U obou sluzeb zapni auto-deploy a nastav watch paths:

- backend: `backend/**`
- frontend: `frontend/**`

Takhle se pri pushi redeployne jen dotcena cast projektu.
