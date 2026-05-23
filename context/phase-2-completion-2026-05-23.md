# Phase 2 Completion Report

Datum: 2026-05-23
Status: Dokonceno a overeno

## Co bylo implementovano

### Datovy model (Prisma)
- Pridany model `Customer`
- Pridany model `CustomerAssignment` s historii prirazeni
- Relace na `User` pro:
  - aktualni/drivejsi obchodnik (`salesRep`)
  - autor zmeny (`assignedBy`, typicky admin)
- Databazova garance: zakaznik muze mit pouze jedno aktivni prirazeni
  - realizovano unique partial indexem (`endedAt IS NULL`)

### Seed data
- Uzivatele:
  - `admin@crm.local` / `Admin123!` (admin)
  - `novak@crm.local` / `Sales123!` (sales_rep)
  - `svoboda@crm.local` / `Sales123!` (sales_rep)
- Zakaznici:
  - Ordinace Alfa
  - Ordinace Beta
- Vychozi prirazeni:
  - Ordinace Alfa -> Novak
  - Ordinace Beta -> Svoboda

### Admin API
- `GET /api/admin/sales-reps`
- `GET /api/admin/customers`
- `POST /api/admin/customers/:customerId/assign`
- Endpointy jsou chranene `requireAuth + requireRole(admin)`

### Frontend (manualni test panel)
- Admin panel pro prepnuti obchodnika zakaznika
- Zobrazeni aktualniho prirazeni a historie zmen
- Tlacitko Refresh pro nacteni aktualnich dat

## Overeni funkcnosti (provedeno)
- Build + lint backend/frontend: OK
- Login admin: OK
- Login sales_rep: OK
- Admin endpointy vraci data: OK
- Ne-admin pristup na admin endpointy: `403` (OK)
- Reassign zakaznika Alfa na jineho obchodnika: OK
- Reassign zpet: OK
- Pri kazdem kroku zustava prave 1 aktivni prirazeni: OK

## Manualni test checklist (pro tebe)
1. Spust `Start-CRM.cmd`.
2. Prihlas se jako `admin@crm.local` / `Admin123!`.
3. V panelu "Admin Assignment Panel" vyber u "Ordinace Alfa" jineho obchodnika a klikni `Reassign`.
4. Over, ze se zmenil "Current rep".
5. Otevri `Assignment history` a over, ze pribyl novy zaznam a predchozi dostal `endedAt`.
6. Vrat prirazeni zpet a znovu over historii.
7. Odhlas se a prihlas jako `novak@crm.local` / `Sales123!`.
8. Over, ze admin panel neni dostupny (nebo admin endpointy vraci 403).
