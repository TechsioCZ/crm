# Phase 7 Completion Report

Datum: 2026-05-24
Status: Dokonceno a overeno

## Co bylo implementovano

### Datovy model (Prisma)
- Pridane enumy:
  - `CustomerGroupScope` (`global`, `private`)
  - `CustomerGroupFilterType` (`active_orders_last_months`)
  - `RecommendationRuleScope` (`global`, `private`)
  - `RecommendationTargetType` (`category`, `top_product`)
- Pridany model `CustomerGroup`:
  - ulozena skupina zakazniku podle filtru
  - scope `global` nebo `private`
  - vlastnik skupiny (`ownerUserId`) pro private skupiny
- Pridany model `RecommendationRule`:
  - globalni/privatni pravidla
  - cil `category` nebo `top_product`
  - minimalni penetrace (`minPenetrationPct`)
- Migrace:
  - `backend/prisma/migrations/20260524112816_phase7_groups_recommendation_rules/migration.sql`

### Seed data
- Seed doplnen o 2 objednavky pro konzistentni test Phase 7:
  - `SEED-PHASE7-ALFA-001` (Ordinace Alfa, bez kategorie `Profylaxe`)
  - `SEED-PHASE7-BETA-001` (Ordinace Beta, s kategorii `Profylaxe`)
- Cilem je zajistit, aby pravidlo typu "Doporucit Profylaxi" melo deterministicky vysledek.

### API (nova Phase 7 route)
- Pridana route:
  - `backend/src/routes/recommendations.ts`
  - mount v `backend/src/server.ts` na `/api/recommendations`
- Endpointy:
  - `GET /api/recommendations/groups`
  - `POST /api/recommendations/groups`
  - `GET /api/recommendations/groups/:groupId/members`
  - `GET /api/recommendations/rules`
  - `POST /api/recommendations/rules`
  - `GET /api/recommendations/opportunities`
  - `GET /api/recommendations/customers/:customerId`
- RBAC pravidla:
  - admin muze tvorit global i private skupiny/pravidla
  - sales rep muze tvorit jen private skupiny/pravidla
  - sales rep vidi pouze vlastni zakazniky ve vysledcich
  - sales rep pravidlo musi byt vazane na jeho vlastni private skupiny

### Frontend demo
- `frontend/src/App.tsx` rozsireno na `Phase 7`.
- Novy `Recommendation Rules Panel`:
  - vytvoreni skupiny (name, scope, monthsBack)
  - vytvoreni pravidla (scope, group, comparison group, target type/value, min penetration)
  - nacitani:
    - vsech viditelnych opportunities
    - opportunities pro vybraneho zakaznika
    - opportunities podle manualniho customer ID
  - seznam viditelnych skupin a pravidel
  - seznam globalnich i customer-specific opportunity vysledku

## Overeni funkcnosti (provedeno)
- Backend:
  - `npm.cmd run lint` -> OK
  - `npm.cmd run build` -> OK
- Frontend:
  - `npm.cmd run lint` -> OK
  - `npm.cmd run build` -> OK
  - smoke start + HTTP check na `http://127.0.0.1:5173` -> OK
- DB/Prisma:
  - `npm.cmd run prisma:migrate -- --name phase7_groups_recommendation_rules` -> OK
  - `npm.cmd run prisma:seed` -> OK
- API smoke test (automatizovane):
  - login admin -> OK
  - create global group -> OK
  - create global rule -> OK
  - admin opportunities obsahuje `Ordinace Alfa` pro cil `Profylaxe` -> OK
  - login `novak@crm.local` -> OK
  - sales rep nevidi ciziho zakaznika ve vysledcich -> OK
  - sales rep create global rule -> `403` (spravne)
  - sales rep cizi customer recommendations -> `403` (spravne)

## Manualni test checklist (pro tebe)
1. Spust `Start-CRM.cmd`.
2. Prihlas se jako `admin@crm.local`.
3. Otevri `Recommendation Rules Panel`.
4. Vytvor skupinu:
   - `Group name`: `Aktivni ordinace`
   - `Scope`: `global`
   - `Active months back`: `12`
5. Vytvor pravidlo:
   - `Rule name`: `Doporucit Profylaxi`
   - `Scope`: `global`
   - `Target type`: `category`
   - `Target value`: `Profylaxe`
   - `Min penetration (%)`: `30`
6. Klikni `Load all visible opportunities`.
7. Over, ze vidis prilezitost pro `Ordinace Alfa`.
8. Odhlas se a prihlas jako `novak@crm.local / Sales123!`.
9. Znovu nacti opportunities.
10. Over, ze nevidis cizi zakazniky (napr. `Ordinace Beta`) ve vysledcich.
