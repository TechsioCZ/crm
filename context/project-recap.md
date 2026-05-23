# CRM MVP - Rekapitulace Projektu

Datum: 2026-05-23
Status: Aktualni zdroj pravdy pro scope, stack a pripravenost prostredi.

## 1) Cíl projektu
Vytvorit MVP analytickeho CRM pro obchodniky, kde obchodnik:
- vidi jen svoje zakazniky,
- analyzuje obraty, kategorie, produkty a top produkty,
- pracuje s doporucenimi/sortimentnimi mezerami podle pravidel,
- vede CRM poznamky a ukoly,
- sleduje zmenu obratu v case.

Administrace musi umoznit:
- spravu prirazeni zakaznik -> obchodnik (vcetne historie),
- rucni XML import objednavek bez duplicit,
- tvorbu globalnich skupin a pravidel.

## 2) Funkcni scope (MVP)
Zdroj business pozadavku je feature soubor:
- `context/mvp-analyticke-crm.feature`

Obsahuje pravidla a scenare pro:
- opravneni a viditelnost zakazniku,
- historii prirazeni obchodniku,
- XML import a audit importu,
- produktovou analytiku bez DPH (bez dopravy/platby),
- analyzu kategorii a top produktu,
- skupiny zakazniku,
- doporucovaci pravidla,
- meziobdobi vyvoj obratu,
- CRM poznamky a ukoly.

## 3) Schvaleny technologicky stack
- Backend: Node.js, TypeScript, Express, Prisma, PostgreSQL, JWT, RBAC
- Fronta uloh: `pg-boss` (nad PostgreSQL, bez Redis)
- Frontend: React + TypeScript + Vite + CSS
- Testy: Vitest + Supertest

Detail stacku je v:
- `context/tech-stack.md`

## 4) Stav prostredi
Aktualne je prostredi pripraveno pro zahajeni vyvoje MVP.
- Node/npm: OK
- Git: OK
- PostgreSQL server + `psql`: OK
- Redis: neni potreba pro zvoleny MVP stack

Detail readiness je v:
- `context/installation-gap-2026-05-23.md`

## 5) Pravidlo dokumentace
Aktualni a zavazne dokumenty v `context/` jsou:
1. `mvp-analyticke-crm.feature`
2. `tech-stack.md`
3. `installation-gap-2026-05-23.md`
4. `project-recap.md` (tento soubor)
5. `development-phases.md`
