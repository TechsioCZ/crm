# Phase 3 Completion Report

Datum: 2026-05-23
Status: Dokonceno a overeno

## Co bylo implementovano

### API pro viditelnost zakazniku podle role
- `GET /api/customers`
- `GET /api/customers/:customerId`

Chovani:
- `admin`: vidi vsechny zakazniky
- `sales_rep`: vidi pouze zakazniky, kteri jsou aktualne prirazeni jemu
- `sales_rep` nema pristup na detail ciziho zakaznika (`403`)

### Logika omezeni pristupu
- Filtrace seznamu je zalozena na aktivnim prirazeni (`endedAt = null`)
- Detail zakaznika kontroluje aktualni prirazeni pred vracenim dat

### Frontend panel pro manualni test
- Pridany "Role Visibility Panel"
- Zobrazi pocet viditelnych zakazniku po loginu
- Umozni nacist detail vybraneho zakaznika
- Umozni nacist detail libovolneho ID (pro test 403 na ciziho)

## Overeni funkcnosti (provedeno)
- Admin vidi 2 zakazniky: OK
- Novak (`sales_rep`) vidi 1 zakaznika: OK
- Svoboda (`sales_rep`) vidi 1 zakaznika: OK
- Novak detail vlastniho zakaznika: `200` OK
- Novak detail ciziho zakaznika: `403` OK
- Svoboda detail vlastniho zakaznika: `200` OK
- Svoboda detail ciziho zakaznika: `403` OK
- Po admin reassignmentu Beta -> Novak: Novak vidi 2 zakazniky
- Po navratu Beta -> Svoboda: Novak zpet vidi 1 zakaznika

## Manualni test checklist (pro tebe)
1. Spust `Start-CRM.cmd`.
2. Prihlas se jako `admin@crm.local`.
3. Over, ze v Role Visibility Panel je videt 2 zakaznici.
4. Prihlas se jako `novak@crm.local`.
5. Over, ze v Role Visibility Panel je videt 1 zakaznik.
6. Klikni `Load detail by ID` pro ID ciziho zakaznika (typicky `2`).
7. Over hlasku o zablokovanem pristupu (`403` expected).
8. Prihlas se jako `admin` a v Admin Assignment Panel prehod `Ordinace Beta` na `Novak`.
9. Prihlas se znovu jako `novak` a over, ze vidi 2 zakazniky.
