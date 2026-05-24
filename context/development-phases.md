# CRM MVP - Faze Vyvoje (s manualnim testem po kazde fazi)

Datum: 2026-05-24
Pocet fazi: 8
Cil: po kazde fazi mit funkcni celek, ktery jde rucne overit.
Aktualni stav: Faze 1-6 dokonceny (2026-05-24), faze 7-8 pending.

## Faze 1 - Zaklad projektu a prihlaseni
### Dodame
- Monorepo strukturu: `backend/`, `frontend/`
- Express API skeleton + React app skeleton
- JWT auth (login/logout/refresh)
- Role `admin` a `sales_rep`

### Manualni test
1. Spust backend i frontend.
2. Prihlas se jako `admin`.
3. Prihlas se jako `sales_rep` v jinem okne.
4. Over, ze neprihlaseny uzivatel nema pristup do chranenych endpointu/UI.

## Faze 2 - Datovy model a prirazeni zakazniku
### Dodame
- Prisma schema: users, customers, assignments history
- Pravidlo: zakaznik ma prave jednoho aktualniho obchodnika
- Admin endpoint/UI pro zmenu prirazeni

### Manualni test
1. Vytvor 2 obchodniky a 2 zakazniky.
2. Prirad zakaznika A obchodnikovi 1.
3. Prehod zakaznika A na obchodnika 2.
4. Over historii a to, ze existuje jen jedno aktivni prirazeni.

## Faze 3 - Opravneni a viditelnost zakazniku
### Dodame
- RBAC + ownership filtry v API
- Seznam a detail zakazniku dle role

### Manualni test
1. Prihlas se jako obchodnik 1.
2. Over, ze vidi jen svoje zakazniky.
3. Zkus otevrit detail ciziho zakaznika -> pristup odmitnut.
4. Prihlas se jako admin -> vidi vsechny zakazniky.

## Faze 4 - XML import objednavek (dokonceno 2026-05-23)
### Dodame
- Rucni upload XML
- Validace povinnych poli
- Upsert objednavek podle `order_id`
- Historie importu (vytvoreno/aktualizovano/chyba)

### Manualni test
1. Nahraj XML s novou objednavkou -> vytvori se.
2. Nahraj XML se stejnym `order_id` a jinym stavem -> aktualizuje se, nevznika duplicita.
3. Nahraj chybne XML bez customer ID -> zaznam chyby v historii importu.

## Faze 5 - Produktova analytika (obrat) (dokonceno 2026-05-24)
### Dodame
- Vypocet obratu z produktovych polozek bez DPH
- Vylouceni dopravy a platby
- Podpora zapornych polozek

### Manualni test
1. Vloz objednavku s produktem 1000, dopravou 150, platbou 50.
2. Over, ze analytika zapocita 1000.
3. Pridej zapornou polozku -200 pro stejny produkt.
4. Over, ze finalni obrat produktu je 800.

## Faze 6 - Kategorie a top produkty (dokonceno 2026-05-24)
### Dodame
- Podil kategorie na obratu zakaznika
- Nekupovane kategorie
- Penetrace top produktu + seznam nekupovanych top produktu

### Manualni test
1. Priprav data: celkem 10000, kategorie X = 2500.
2. Over zobrazeni podilu 25 %.
3. Over zobrazeni nekupovane kategorie.
4. Nastav 10 top produktu, zakaznik ma 3 -> over penetraci 30 %.

## Faze 7 - Skupiny a doporucovaci pravidla
### Dodame
- Ukladane filtry skupin zakazniku
- Globalni pravidla (admin) a osobni pravidla (obchodnik)
- Vyhodnoceni doporuceni/sortimentnich mezer nad skupinami

### Manualni test
1. Vytvor admin skupinu "Aktivni ordinace".
2. Vytvor pravidlo "Doporucit Profylaxi".
3. Over, ze zakaznik bez nakupu kategorie dostane doporuceni.
4. Over, ze obchodnik nevidi cizi zakazniky ve vysledcich pravidel.

## Faze 8 - CRM poznamky, ukoly a finalni doladeni
### Dodame
- Poznamky a ukoly navazane na zakaznika s opravnenim
- Zakladni dashboard vyvoje obratu v case
- Stabilizace, bugfixy, seed data, finalni UX

### Manualni test
1. Obchodnik prida poznamku ke svemu zakaznikovi -> ulozi se autor a datum.
2. Obchodnik vytvori ukol s terminem/prioritou.
3. Obchodnik zkusi poznamku k cizimu zakaznikovi -> system odmitne.
4. Over porovnani dvou stejne dlouhych obdobi a procentni zmenu obratu.

