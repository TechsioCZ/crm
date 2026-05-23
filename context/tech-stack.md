# CRM MVP - Technologický Stack

Datum: 2026-05-23
Status: Schválený stack pro implementaci MVP analytického CRM

## 1) Hlavní technologie

### Backend
- Runtime: Node.js 24 LTS
- Jazyk: TypeScript 5
- Framework: Express 5
- ORM: Prisma 6
- Databáze: PostgreSQL 16+
- Fronta úloh: pg-boss (nad PostgreSQL, bez Redis)
- Autentizace: JWT (access + refresh token)
- Autorizace: RBAC (role `admin`, `sales_rep`)

### Frontend
- Framework: React 19
- Jazyk: TypeScript 5
- Build tool: Vite 7
- Stylování: CSS (možné rozšíření o Tailwind)
- Zobrazení analytiky: React + charting knihovna (např. Recharts / Chart.js)

### Data a importy
- Ruční XML import: parser na Node.js (`fast-xml-parser` nebo `xml2js`)
- Idempotence importu: unikátní klíč `order_id` + upsert logika
- Asynchronní zpracování: `pg-boss` worker nad PostgreSQL

### Testování a kvalita
- Unit/integrační testy: Vitest
- API testy: Supertest
- E2E (volitelné v další fázi): Playwright
- Lint: ESLint
- Format: Prettier

## 2) Minimální verze nástrojů
- Node.js: >= 24.x
- npm: >= 11.x
- PostgreSQL: >= 16
- TypeScript: >= 5.6

## 3) Struktura projektu (doporučení)
- `backend/` - Express API, Prisma schema, business logika, queue workers
- `frontend/` - React aplikace
- `context/` - produktový kontext, pravidla, technická rozhodnutí
- `docs/` - technická dokumentace, ADR, API kontrakty

## 4) Proč je tento stack vhodný pro tvoje scénáře
- RBAC a přiřazení zákazníků: snadno řešitelné v Express middleware + DB constraints.
- XML import bez duplicit: Prisma + PostgreSQL upsert + unique index na `order_id`.
- Analytika (obraty, kategorie, top produkty): PostgreSQL dobře zvládá agregace a časové porovnání.
- Doporučení podle pravidel: worker procesy v `pg-boss` umožní bezpečné přepočty bez další infrastruktury.

## 5) Vývojové standardy
- Vše v TypeScriptu (`strict` mode zapnutý).
- Migrace pouze přes Prisma migrations.
- Každá business feature musí mít minimálně unit/integration test.
- Audit log pro importy a změny přiřazení zákazníků.

## 6) Co je potřeba mít nainstalované lokálně
- Node.js + npm
- PostgreSQL (server + CLI)
- Git

Volitelně (doporučeno):
- Docker Desktop + docker compose (snadný lokální běh Postgres)
- pgAdmin / TablePlus (správa DB)
- VS Code/Cursor + TypeScript/ESLint/Prisma extension
