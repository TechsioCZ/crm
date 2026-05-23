Feature: MVP analytické CRM pro obchodníky
  Systém umožňuje obchodníkům analyzovat vlastní zákazníky podle objednávek,
  kategorií, produktů a top produktů a pracovat s doporučeními podle
  konfigurovatelných pravidel.

  Rule: Přístup k zákazníkům je omezen podle role a aktuálního přiřazení

    Scenario: Obchodník vidí pouze své zákazníky
      Given existuje obchodník "Novák"
      And zákazník "Ordinace Alfa" je aktuálně přiřazen obchodníkovi "Novák"
      And zákazník "Ordinace Beta" je aktuálně přiřazen jinému obchodníkovi
      When obchodník "Novák" zobrazí seznam zákazníků
      Then systém zobrazí zákazníka "Ordinace Alfa"
      And systém nezobrazí zákazníka "Ordinace Beta"

    Scenario: Obchodník nemůže zobrazit detail cizího zákazníka
      Given zákazník "Ordinace Beta" je přiřazen jinému obchodníkovi než přihlášenému uživateli
      When obchodník se pokusí zobrazit detail zákazníka "Ordinace Beta"
      Then systém detail zákazníka nezpřístupní

    Scenario: Administrátor vidí všechny zákazníky
      Given existují zákazníci přiřazení různým obchodníkům
      When administrátor zobrazí seznam zákazníků
      Then systém zobrazí všechny zákazníky

  Rule: Zákazník má právě jednoho aktuálního obchodníka a historii změn

    Scenario: Administrátor změní obchodníka zákazníka
      Given zákazník "Ordinace Alfa" je aktuálně přiřazen obchodníkovi "Novák"
      When administrátor přiřadí zákazníka "Ordinace Alfa" obchodníkovi "Svoboda"
      Then aktuální obchodník zákazníka je "Svoboda"
      And systém uloží do historie, že předchozí obchodník byl "Novák"

    Scenario: Zákazník nemůže mít dva aktuální obchodníky
      Given zákazník "Ordinace Alfa" je aktuálně přiřazen obchodníkovi "Novák"
      When administrátor přiřadí zákazníka "Ordinace Alfa" obchodníkovi "Svoboda"
      Then systém ukončí aktuální přiřazení obchodníkovi "Novák"
      And systém nastaví jako aktuální přiřazení pouze obchodníka "Svoboda"

  Rule: Ruční XML import vytváří a aktualizuje objednávky bez duplicit

    Scenario: Administrátor importuje novou objednávku
      Given administrátor má platný XML soubor
      And XML obsahuje objednávku s order_id "123"
      And objednávka s order_id "123" zatím v systému neexistuje
      When administrátor spustí ruční import XML
      Then systém vytvoří objednávku s order_id "123"
      And systém vytvoří její položky
      And systém uloží výsledek importu do historie importů

    Scenario: Opakovaný import stejné objednávky aktualizuje existující objednávku
      Given v systému existuje objednávka s order_id "123" ve stavu "čeká na dodavatele"
      And XML obsahuje objednávku s order_id "123" ve stavu "v přepravě"
      When administrátor spustí ruční import XML
      Then systém nevytvoří duplicitní objednávku
      And systém aktualizuje stav objednávky na "v přepravě"
      And systém započítá objednávku jako aktualizovanou v historii importu

    Scenario: Import s chybějícím povinným údajem zapíše chybu
      Given XML obsahuje objednávku bez zákaznického ID
      When administrátor spustí ruční import XML
      Then systém danou objednávku neimportuje jako platnou objednávku
      And systém zapíše chybu do detailu importu
      And systém zobrazí počet chybných záznamů v historii importu

  Rule: Produktová analytika používá cenu bez DPH v CZK

    Scenario: Systém vypočítá obrat zákazníka za vybrané období
      Given zákazník "Ordinace Alfa" má ve vybraném období produktové objednávky
      And položky objednávek mají ceny bez DPH v CZK
      When obchodník zobrazí detail zákazníka za dané období
      Then systém zobrazí obrat jako součet produktových položek bez DPH

    Scenario: Doprava a platba nejsou součástí produktové analytiky
      Given objednávka obsahuje produktovou položku za 1000 CZK bez DPH
      And objednávka obsahuje dopravu za 150 CZK bez DPH
      And objednávka obsahuje platbu za 50 CZK bez DPH
      When systém počítá produktovou analytiku
      Then do produktové analytiky započítá 1000 CZK
      And do produktové analytiky nezapočítá dopravu ani platbu

    Scenario: Záporná produktová položka snižuje obrat produktu a kategorie
      Given zákazník koupil produkt "Rukavice" za 1000 CZK bez DPH
      And zákazník má zápornou produktovou položku "Rukavice" za -200 CZK bez DPH
      When systém počítá obrat produktu "Rukavice"
      Then výsledný obrat produktu je 800 CZK bez DPH

  Rule: Obchodník analyzuje kategorie zákazníka

    Scenario: Systém zobrazí podíl kategorie na obratu zákazníka
      Given zákazník má za vybrané období celkový produktový obrat 10000 CZK bez DPH
      And obrat v kategorii "Výplňové materiály" je 2500 CZK bez DPH
      When obchodník zobrazí kategorickou analytiku zákazníka
      Then systém zobrazí podíl kategorie "Výplňové materiály" jako 25 %

    Scenario: Systém zobrazí kategorii jako nekupovanou
      Given existuje kategorie "Implantologie"
      And zákazník nikdy nekoupil žádný produkt z kategorie "Implantologie"
      When obchodník zobrazí detail zákazníka
      Then systém zobrazí kategorii "Implantologie" mezi nekupovanými kategoriemi

  Rule: Obchodník analyzuje top produkty zákazníka

    Scenario: Systém zobrazí penetraci top produktů
      Given existuje 10 globálních top produktů
      And zákazník koupil 3 z těchto top produktů
      When obchodník zobrazí detail zákazníka
      Then systém zobrazí, že zákazník kupuje 3 z 10 top produktů
      And systém zobrazí penetraci top produktů 30 %

    Scenario: Systém zobrazí top produkty, které zákazník nikdy nekoupil
      Given existuje globální top produkt "Kompozit A"
      And zákazník nikdy nekoupil top produkt "Kompozit A"
      When obchodník zobrazí detail zákazníka
      Then systém zobrazí "Kompozit A" mezi nekupovanými top produkty

  Rule: Skupiny zákazníků jsou uložené filtry a respektují oprávnění

    Scenario: Administrátor vytvoří skupinu zákazníků nad všemi zákazníky
      Given administrátor nastavuje skupinu zákazníků "Aktivní ordinace"
      And filtr skupiny vybírá zákazníky s alespoň jednou objednávkou za posledních 12 měsíců
      When administrátor skupinu uloží
      Then systém skupinu uloží jako dostupnou pro globální pravidla

    Scenario: Obchodník vytvoří vlastní skupinu pouze ze svých zákazníků
      Given obchodník "Novák" má přiřazené zákazníky "Ordinace Alfa" a "Ordinace Beta"
      And zákazník "Ordinace Gama" je přiřazen jinému obchodníkovi
      When obchodník "Novák" vytvoří skupinu zákazníků podle vlastního filtru
      Then systém do skupiny může zahrnout pouze zákazníky "Ordinace Alfa" a "Ordinace Beta"
      And systém do skupiny nezahrne zákazníka "Ordinace Gama"

  Rule: Doporučení a sortimentní mezery vznikají podle konfigurovatelných pravidel

    Scenario: Administrátor vytvoří globální pravidlo pro doporučení kategorie
      Given administrátor vytváří pravidlo "Doporučit Profylaxi"
      And pravidlo se vztahuje na skupinu zákazníků "Aktivní ordinace"
      And cílová kategorie je "Profylaxe"
      And podmínka pravidla je "zákazník nikdy nekoupil cílovou kategorii"
      And práh významnosti je "cílovou kategorii koupilo alespoň 30 % zákazníků ve srovnávací skupině"
      When administrátor pravidlo uloží
      Then systém pravidlo zpřístupní jako globální pravidlo pro všechny obchodníky

    Scenario: Obchodník vytvoří vlastní pravidlo pouze pro sebe
      Given přihlášený obchodník má vlastní skupinu zákazníků "Moje aktivní ordinace"
      When obchodník vytvoří pravidlo doporučení nad skupinou "Moje aktivní ordinace"
      Then systém pravidlo uloží jako vlastní pravidlo tohoto obchodníka
      And systém pravidlo nezpřístupní ostatním obchodníkům
      And systém pravidlo nevyhodnocuje nad zákazníky jiných obchodníků

    Scenario: Systém zobrazí zákazníkovi doporučení podle splněného pravidla
      Given existuje pravidlo "Doporučit Profylaxi"
      And pravidlo se vztahuje na skupinu "Aktivní ordinace"
      And zákazník "Ordinace Alfa" patří do skupiny "Aktivní ordinace"
      And zákazník "Ordinace Alfa" nikdy nekoupil kategorii "Profylaxe"
      And kategorii "Profylaxe" koupilo alespoň 30 % zákazníků ve srovnávací skupině
      When obchodník zobrazí doporučení pro zákazníka "Ordinace Alfa"
      Then systém zobrazí kategorii "Profylaxe" jako doporučení k nabídnutí

    Scenario: Systém nezobrazí doporučení, pokud zákazník nesplňuje pravidlo
      Given existuje pravidlo "Doporučit Profylaxi"
      And zákazník "Ordinace Alfa" už koupil kategorii "Profylaxe"
      When systém vyhodnocuje doporučení podle tohoto pravidla
      Then systém nezobrazí kategorii "Profylaxe" jako sortimentní mezeru zákazníka

    Scenario: Obchodník nevidí výsledky pravidla pro cizí zákazníky
      Given existuje pravidlo pro doporučení top produktu
      And pravidlo vyhodnotí zákazníka "Ordinace Beta" jako obchodní příležitost
      And zákazník "Ordinace Beta" je přiřazen jinému obchodníkovi
      When přihlášený obchodník zobrazí výsledky doporučení
      Then systém nezobrazí zákazníka "Ordinace Beta"

  Rule: Obchodník sleduje změnu obratu v čase

    Scenario: Systém porovná vybrané období s předchozím obdobím stejné délky
      Given obchodník vybere období od 2026-01-01 do 2026-03-31
      And zákazník měl v tomto období obrat 90000 CZK bez DPH
      And zákazník měl v předchozím období od 2025-10-01 do 2025-12-31 obrat 120000 CZK bez DPH
      When systém zobrazí vývoj obratu zákazníka
      Then systém zobrazí pokles obratu o 25 %

  Rule: CRM poznámky a úkoly jsou vázané na zákazníka a oprávnění

    Scenario: Obchodník přidá poznámku k vlastnímu zákazníkovi
      Given zákazník "Ordinace Alfa" je přiřazen přihlášenému obchodníkovi
      When obchodník vytvoří poznámku s textem "Domluvit nabídku na rukavice"
      Then systém uloží poznámku k zákazníkovi "Ordinace Alfa"
      And systém u poznámky uloží autora a datum vytvoření

    Scenario: Obchodník vytvoří úkol k vlastnímu zákazníkovi
      Given zákazník "Ordinace Alfa" je přiřazen přihlášenému obchodníkovi
      When obchodník vytvoří úkol s termínem, prioritou a popisem
      Then systém uloží úkol k zákazníkovi "Ordinace Alfa"
      And systém zobrazí úkol mezi úkoly daného obchodníka

    Scenario: Obchodník nesmí vytvořit poznámku k cizímu zákazníkovi
      Given zákazník "Ordinace Beta" je přiřazen jinému obchodníkovi
      When obchodník se pokusí vytvořit poznámku k zákazníkovi "Ordinace Beta"
      Then systém poznámku neuloží
      And systém neumožní obchodníkovi pracovat s tímto zákazníkem
