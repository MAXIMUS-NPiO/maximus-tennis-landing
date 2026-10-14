/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Owner request, 13 October 2026. A proposed country collection; no stock or production claim. */
const rows = {
  en: [
    "National Package · Country collection",
    "A proposed reference and fitting collection for each country: two examples of every weight, length and factory grip combination across the three playing series and both trainers.",
    "Individual fitting should include people who need uncommon larger grips. The aim is access to suitable factory sizes, including L6 and L7, so a less common hand size is part of the selection.",
    "Custom lengths are reviewed separately and are outside this matrix. Precision classes do not multiply this count.",
    "Collection specification for planning and discussion. It does not confirm stock, production readiness, a sale or delivery; technical approval and commercial terms are agreed separately.",
    "Historical baseline",
    "Weight × length variants"
  ],
  ru: [
    "National Package · Комплект для страны",
    "Предлагаемая эталонная коллекция для знакомства и индивидуального подбора в каждой стране: по два экземпляра каждой комбинации веса, длины и заводской ручки во всех трёх игровых сериях и обеих линиях тренажёров.",
    "Индивидуальный подбор должен учитывать и людей, которым нужны редкие большие ручки. Цель — доступ к подходящим заводским размерам, включая L6 и L7, чтобы менее распространённый размер руки тоже был учтён.",
    "Индивидуальные длины рассматриваются отдельно и не входят в эту матрицу. Классы точности не увеличивают этот счётчик.",
    "Спецификация коллекции для планирования и обсуждения. Она не подтверждает складские остатки, готовность производства, продажу или поставку; техническое одобрение и коммерческие условия согласуются отдельно.",
    "Историческая базовая спецификация",
    "Варианты веса × длины"
  ],
  uk: [
    "National Package · Комплект для країни",
    "Запропонована еталонна колекція для ознайомлення та індивідуального підбору в кожній країні: по два примірники кожної комбінації ваги, довжини та заводської ручки в усіх трьох ігрових серіях і обох лініях тренажерів.",
    "Індивідуальний підбір має враховувати й людей, яким потрібні рідкісні великі ручки. Мета — доступ до відповідних заводських розмірів, зокрема L6 і L7, щоб менш поширений розмір руки також був врахований.",
    "Індивідуальні довжини розглядаються окремо та не входять до цієї матриці. Класи точності не збільшують цей підрахунок.",
    "Специфікація колекції для планування й обговорення. Вона не підтверджує наявність на складі, готовність виробництва, продаж або постачання; технічне схвалення й комерційні умови погоджуються окремо.",
    "Історична базова специфікація",
    "Варіанти ваги × довжини"
  ],
  be: [
    "National Package · Камплект для краіны",
    "Прапанаваная эталонная калекцыя для знаёмства і індывідуальнага падбору ў кожнай краіне: па два асобнікі кожнай камбінацыі вагі, даўжыні і заводскай ручкі ва ўсіх трох гульнявых серыях і абедзвюх лініях трэнажораў.",
    "Індывідуальны падбор павінен улічваць і людзей, якім патрэбныя рэдкія вялікія ручкі. Мэта — доступ да адпаведных заводскіх памераў, у тым ліку L6 і L7, каб менш распаўсюджаны памер рукі таксама ўлічваўся.",
    "Індывідуальныя даўжыні разглядаюцца асобна і не ўваходзяць у гэтую матрыцу. Класы дакладнасці не павялічваюць гэты падлік.",
    "Спецыфікацыя калекцыі для планавання і абмеркавання. Яна не пацвярджае складскія запасы, гатоўнасць вытворчасці, продаж або пастаўку; тэхнічнае ўхваленне і камерцыйныя ўмовы ўзгадняюцца асобна.",
    "Гістарычная базавая спецыфікацыя",
    "Варыянты вагі × даўжыні"
  ],
  de: [
    "National Package · Länderkollektion",
    "Eine vorgeschlagene Referenz- und Fittingkollektion für jedes Land: jeweils zwei Exemplare jeder Kombination aus Gewicht, Länge und Werksgriff in den drei Spielserien und beiden Trainingslinien.",
    "Individuelles Fitting soll auch Menschen berücksichtigen, die seltene größere Griffe benötigen. Ziel ist der Zugang zu passenden Werksgrößen, einschließlich L6 und L7, damit auch ungewöhnlichere Handgrößen zur Auswahl gehören.",
    "Individuelle Längen werden separat geprüft und gehören nicht zu dieser Matrix. Präzisionsklassen vervielfachen diese Anzahl nicht.",
    "Kollektion zur Planung und Abstimmung. Sie bestätigt weder Lagerbestand noch Produktionsreife, Verkauf oder Lieferung; technische Freigabe und Geschäftsbedingungen werden gesondert vereinbart.",
    "Historische Basisspezifikation",
    "Varianten aus Gewicht × Länge"
  ],
  nl: [
    "National Package · Landencollectie",
    "Een voorgestelde referentie- en pascollectie voor elk land: twee exemplaren van elke combinatie van gewicht, lengte en fabrieksgrip in de drie speelseries en beide trainingslijnen.",
    "Individueel passen moet ook rekening houden met mensen die minder gangbare grote grips nodig hebben. Het doel is toegang tot passende fabrieksmaten, waaronder L6 en L7, zodat ook een minder gebruikelijke handmaat meetelt.",
    "Maatwerklengtes worden apart beoordeeld en vallen buiten deze matrix. Precisieklassen vermenigvuldigen dit aantal niet.",
    "Collectiespecificatie voor planning en overleg. Dit bevestigt geen voorraad, productiegereedheid, verkoop of levering; technische goedkeuring en commerciële voorwaarden worden apart afgesproken.",
    "Historische basisspecificatie",
    "Varianten gewicht × lengte"
  ],
  fr: [
    "National Package · Collection par pays",
    "Une collection de référence et d’essai proposée pour chaque pays : deux exemplaires de chaque combinaison de poids, de longueur et de manche d’usine, dans les trois séries de jeu et les deux gammes d’entraînement.",
    "L’ajustement individuel doit aussi inclure les personnes qui ont besoin de grands manches peu courants. L’objectif est l’accès aux tailles d’usine adaptées, dont L6 et L7, afin de tenir compte des tailles de main moins répandues.",
    "Les longueurs sur mesure sont étudiées séparément et sont hors de cette matrice. Les classes de précision ne multiplient pas ce décompte.",
    "Spécification de collection destinée à la planification et à la discussion. Elle ne confirme ni stock, ni aptitude à la production, ni vente ou livraison ; l’approbation technique et les conditions commerciales font l’objet d’un accord séparé.",
    "Spécification historique de référence",
    "Variantes poids × longueur"
  ],
  es: [
    "National Package · Colección por país",
    "Una colección de referencia y ajuste propuesta para cada país: dos ejemplares de cada combinación de peso, longitud y empuñadura de fábrica de las tres series de juego y las dos líneas de entrenamiento.",
    "El ajuste individual también debe incluir a quienes necesitan empuñaduras grandes poco habituales. El objetivo es acceder a tamaños de fábrica adecuados, incluidos L6 y L7, para tener en cuenta los tamaños de mano menos comunes.",
    "Las longitudes a medida se revisan por separado y quedan fuera de esta matriz. Las clases de precisión no multiplican este recuento.",
    "Especificación de colección para planificación y consulta. No confirma existencias, preparación para fabricar, venta ni entrega; la aprobación técnica y las condiciones comerciales se acuerdan por separado.",
    "Especificación histórica de referencia",
    "Variantes de peso × longitud"
  ],
  it: [
    "National Package · Collezione per paese",
    "Una collezione di riferimento e prova proposta per ogni paese: due esemplari di ogni combinazione di peso, lunghezza e impugnatura di fabbrica nelle tre serie da gioco e nelle due linee da allenamento.",
    "La scelta individuale deve includere anche chi necessita di impugnature grandi poco comuni. L’obiettivo è l’accesso a misure di fabbrica adatte, comprese L6 e L7, considerando anche le dimensioni della mano meno diffuse.",
    "Le lunghezze su misura sono valutate separatamente e non rientrano in questa matrice. Le classi di precisione non moltiplicano questo conteggio.",
    "Specifica della collezione per pianificazione e confronto. Non conferma scorte, prontezza produttiva, vendita o consegna; l’approvazione tecnica e le condizioni commerciali sono concordate separatamente.",
    "Specifica storica di riferimento",
    "Varianti peso × lunghezza"
  ],
  pt: [
    "National Package · Coleção por país",
    "Uma coleção de referência e ajuste proposta para cada país: dois exemplares de cada combinação de peso, comprimento e punho de fábrica nas três séries de jogo e nas duas linhas de treino.",
    "O ajuste individual também deve incluir quem precisa de punhos grandes pouco comuns. O objetivo é o acesso a tamanhos de fábrica adequados, incluindo L6 e L7, contemplando tamanhos de mão menos frequentes.",
    "Os comprimentos por medida são analisados separadamente e ficam fora desta matriz. As classes de precisão não multiplicam esta contagem.",
    "Especificação da coleção para planeamento e discussão. Não confirma stock, prontidão de produção, venda ou entrega; a aprovação técnica e as condições comerciais são acordadas separadamente.",
    "Especificação histórica de referência",
    "Variantes de peso × comprimento"
  ],
  pl: [
    "National Package · Kolekcja dla kraju",
    "Proponowana kolekcja wzorcowa do poznania sprzętu i indywidualnego dopasowania w każdym kraju: po dwa egzemplarze każdej kombinacji masy, długości i fabrycznego uchwytu we wszystkich trzech seriach do gry i obu liniach treningowych.",
    "Indywidualne dopasowanie powinno uwzględniać także osoby potrzebujące rzadkich, większych uchwytów. Celem jest dostęp do odpowiednich rozmiarów fabrycznych, w tym L6 i L7, również dla mniej typowych rozmiarów dłoni.",
    "Długości indywidualne są oceniane osobno i nie należą do tej matrycy. Klasy precyzji nie mnożą tej liczby.",
    "Specyfikacja kolekcji do planowania i omówienia. Nie potwierdza zapasów, gotowości produkcji, sprzedaży ani dostawy; zatwierdzenie techniczne i warunki handlowe ustala się osobno.",
    "Historyczna specyfikacja bazowa",
    "Warianty masy × długości"
  ],
  hu: [
    "National Package · Országos kollekció",
    "Javasolt referencia- és illesztési kollekció minden ország számára: a három játékütő-sorozat és mindkét edzőeszköz-család minden tömeg-, hosszúság- és gyári markolatkombinációjából két példány.",
    "Az egyéni illesztésnek a ritka, nagyobb markolatot igénylő embereket is figyelembe kell vennie. A cél a megfelelő gyári méretekhez, köztük az L6 és L7 mérethez való hozzáférés, hogy a kevésbé gyakori kézméret is számítson.",
    "Az egyedi hosszúságokat külön vizsgáljuk, és nem részei ennek a mátrixnak. A pontossági osztályok nem szorozzák meg ezt a darabszámot.",
    "Tervezésre és egyeztetésre szolgáló kollekcióspecifikáció. Nem igazol készletet, gyártási készültséget, értékesítést vagy szállítást; a műszaki jóváhagyást és a kereskedelmi feltételeket külön rögzítjük.",
    "Korábbi alap-specifikáció",
    "Tömeg × hosszúság változatok"
  ],
  sk: [
    "National Package · Kolekcia pre krajinu",
    "Navrhovaná referenčná kolekcia na oboznámenie a individuálny výber v každej krajine: dva kusy z každej kombinácie hmotnosti, dĺžky a továrenskej rukoväti vo všetkých troch herných sériách a oboch tréningových líniách.",
    "Individuálny výber má zahŕňať aj ľudí, ktorí potrebujú zriedkavé väčšie rukoväti. Cieľom je prístup k vhodným továrenským veľkostiam vrátane L6 a L7, aby sa zohľadnili aj menej bežné veľkosti rúk.",
    "Individuálne dĺžky sa posudzujú osobitne a nie sú súčasťou tejto matice. Triedy presnosti tento počet nenásobia.",
    "Špecifikácia kolekcie na plánovanie a diskusiu. Nepotvrdzuje zásoby, výrobnú pripravenosť, predaj ani dodanie; technické schválenie a obchodné podmienky sa dohodnú osobitne.",
    "Historická základná špecifikácia",
    "Varianty hmotnosti × dĺžky"
  ],
  hr: [
    "National Package · Kolekcija za zemlju",
    "Predložena referentna kolekcija za upoznavanje i individualni odabir u svakoj zemlji: po dva primjerka svake kombinacije težine, duljine i tvorničke drške u sve tri igračke serije i obje linije za trening.",
    "Individualni odabir treba obuhvatiti i ljude kojima trebaju rijetke veće drške. Cilj je pristup odgovarajućim tvorničkim veličinama, uključujući L6 i L7, kako bi se uvažile i manje uobičajene veličine ruku.",
    "Duljine po mjeri razmatraju se zasebno i nisu dio ove matrice. Razredi preciznosti ne umnožavaju ovaj broj.",
    "Specifikacija kolekcije za planiranje i raspravu. Ne potvrđuje zalihe, spremnost proizvodnje, prodaju ili isporuku; tehničko odobrenje i komercijalni uvjeti dogovaraju se zasebno.",
    "Povijesna osnovna specifikacija",
    "Varijante težine × duljine"
  ],
  sr: [
    "National Package · Kolekcija za zemlju",
    "Predložena referentna kolekcija za upoznavanje i individualni izbor u svakoj zemlji: po dva primerka svake kombinacije težine, dužine i fabričke drške u sve tri igračke serije i obe linije za trening.",
    "Individualni izbor treba da obuhvati i ljude kojima su potrebne retke veće drške. Cilj je pristup odgovarajućim fabričkim veličinama, uključujući L6 i L7, kako bi se uvažile i manje uobičajene veličine šake.",
    "Dužine po meri razmatraju se zasebno i nisu deo ove matrice. Klase preciznosti ne umnožavaju ovaj broj.",
    "Specifikacija kolekcije za planiranje i razgovor. Ne potvrđuje zalihe, spremnost proizvodnje, prodaju ili isporuku; tehničko odobrenje i komercijalni uslovi dogovaraju se zasebno.",
    "Istorijska osnovna specifikacija",
    "Varijante težine × dužine"
  ],
  ro: [
    "National Package · Colecție pentru fiecare țară",
    "O colecție de referință și probă propusă pentru fiecare țară: câte două exemplare din fiecare combinație de greutate, lungime și mâner de fabrică, în cele trei serii de joc și ambele linii de antrenament.",
    "Alegerea individuală trebuie să includă și persoanele care au nevoie de mânere mari mai rare. Scopul este accesul la dimensiuni de fabrică potrivite, inclusiv L6 și L7, ținând cont și de mărimile mâinii mai puțin obișnuite.",
    "Lungimile personalizate se evaluează separat și nu fac parte din această matrice. Clasele de precizie nu multiplică acest număr.",
    "Specificație de colecție pentru planificare și discuții. Nu confirmă stocuri, pregătirea producției, vânzarea sau livrarea; aprobarea tehnică și condițiile comerciale se stabilesc separat.",
    "Specificație istorică de bază",
    "Variante greutate × lungime"
  ],
  bg: [
    "National Package · Колекция за страната",
    "Предложена еталонна колекция за запознаване и индивидуален подбор във всяка страна: по два екземпляра от всяка комбинация на тегло, дължина и фабрична дръжка във всичките три игрови серии и двете тренировъчни линии.",
    "Индивидуалният подбор трябва да включва и хората, които се нуждаят от редки по-големи дръжки. Целта е достъп до подходящи фабрични размери, включително L6 и L7, с внимание и към по-необичайните размери на ръката.",
    "Индивидуалните дължини се разглеждат отделно и не са част от тази матрица. Класовете за точност не умножават този брой.",
    "Спецификация на колекцията за планиране и обсъждане. Тя не потвърждава наличности, производствена готовност, продажба или доставка; техническото одобрение и търговските условия се съгласуват отделно.",
    "Историческа базова спецификация",
    "Варианти тегло × дължина"
  ],
  el: [
    "National Package · Συλλογή ανά χώρα",
    "Προτεινόμενη συλλογή αναφοράς και δοκιμής για κάθε χώρα: δύο τεμάχια από κάθε συνδυασμό βάρους, μήκους και εργοστασιακής λαβής στις τρεις σειρές παιχνιδιού και στις δύο σειρές προπόνησης.",
    "Η ατομική επιλογή πρέπει να περιλαμβάνει και όσους χρειάζονται σπάνιες μεγαλύτερες λαβές. Στόχος είναι η πρόσβαση σε κατάλληλα εργοστασιακά μεγέθη, όπως L6 και L7, ώστε να λαμβάνονται υπόψη και τα λιγότερο συνηθισμένα μεγέθη χεριού.",
    "Τα εξατομικευμένα μήκη εξετάζονται χωριστά και δεν περιλαμβάνονται σε αυτόν τον πίνακα. Οι κλάσεις ακρίβειας δεν πολλαπλασιάζουν αυτό το σύνολο.",
    "Προδιαγραφή συλλογής για σχεδιασμό και συζήτηση. Δεν επιβεβαιώνει απόθεμα, ετοιμότητα παραγωγής, πώληση ή παράδοση· η τεχνική έγκριση και οι εμπορικοί όροι συμφωνούνται χωριστά.",
    "Ιστορική βασική προδιαγραφή",
    "Παραλλαγές βάρους × μήκους"
  ],
  sv: [
    "National Package · Landssamling",
    "En föreslagen referens- och utprovningssamling för varje land: två exemplar av varje kombination av vikt, längd och fabriksgrepp inom de tre spelserierna och båda träningslinjerna.",
    "Individuell utprovning ska även omfatta personer som behöver ovanliga större grepp. Målet är tillgång till lämpliga fabriksstorlekar, inklusive L6 och L7, så att även mindre vanliga handstorlekar beaktas.",
    "Specialanpassade längder bedöms separat och ingår inte i denna matris. Precisionsklasser multiplicerar inte detta antal.",
    "Samlingsspecifikation för planering och diskussion. Den bekräftar inte lager, produktionsberedskap, försäljning eller leverans; tekniskt godkännande och kommersiella villkor avtalas separat.",
    "Historisk grundspecifikation",
    "Varianter av vikt × längd"
  ],
  no: [
    "National Package · Landssamling",
    "En foreslått referanse- og tilpasningssamling for hvert land: to eksemplarer av hver kombinasjon av vekt, lengde og fabrikkgrep i de tre spillseriene og begge treningslinjene.",
    "Individuell tilpasning skal også omfatte personer som trenger uvanlige større grep. Målet er tilgang til passende fabrikkstørrelser, inkludert L6 og L7, slik at også mindre vanlige håndstørrelser tas med.",
    "Tilpassede lengder vurderes separat og er utenfor denne matrisen. Presisjonsklassene multipliserer ikke dette antallet.",
    "Samlingsspesifikasjon for planlegging og diskusjon. Den bekrefter ikke lagerbeholdning, produksjonsberedskap, salg eller levering; teknisk godkjenning og kommersielle vilkår avtales separat.",
    "Historisk grunnspesifikasjon",
    "Varianter av vekt × lengde"
  ],
  tr: [
    "National Package · Ülke koleksiyonu",
    "Her ülke için önerilen referans ve kişiye uygun seçim koleksiyonu: üç oyun serisi ile iki antrenman serisindeki her ağırlık, uzunluk ve fabrika grip kombinasyonundan ikişer adet.",
    "Kişiye uygun seçim, nadir büyük grip boyutlarına ihtiyaç duyanları da kapsamalıdır. Amaç, L6 ve L7 dâhil uygun fabrika boyutlarına erişim sağlayarak daha az yaygın el ölçülerini de dikkate almaktır.",
    "Özel uzunluklar ayrıca incelenir ve bu matrisin dışındadır. Hassasiyet sınıfları bu sayıyı çoğaltmaz.",
    "Planlama ve görüşme için koleksiyon spesifikasyonu. Stok, üretime hazır olma, satış veya teslimat teyidi değildir; teknik onay ve ticari koşullar ayrıca kararlaştırılır.",
    "Geçmiş temel spesifikasyon",
    "Ağırlık × uzunluk seçenekleri"
  ],
  az: [
    "National Package · Ölkə kolleksiyası",
    "Hər ölkə üçün təklif olunan nümunə və fərdi seçim kolleksiyası: üç oyun seriyası və hər iki məşq xəttində çəki, uzunluq və zavod tutacağı kombinasiyalarının hərəsindən iki ədəd.",
    "Fərdi seçim nadir böyük tutacaqlara ehtiyacı olan insanları da əhatə etməlidir. Məqsəd L6 və L7 daxil olmaqla uyğun zavod ölçülərinə çıxışdır ki, az rast gəlinən əl ölçüləri də nəzərə alınsın.",
    "Fərdi uzunluqlar ayrıca nəzərdən keçirilir və bu matrisə daxil deyil. Dəqiqlik sinifləri bu sayı artırmır.",
    "Planlaşdırma və müzakirə üçün kolleksiya spesifikasiyası. Anbar qalığını, istehsala hazırlığı, satışı və ya çatdırılmanı təsdiqləmir; texniki təsdiq və kommersiya şərtləri ayrıca razılaşdırılır.",
    "Tarixi əsas spesifikasiya",
    "Çəki × uzunluq variantları"
  ],
  uz: [
    "National Package · Mamlakat kolleksiyasi",
    "Har bir mamlakat uchun taklif etilayotgan namuna va individual tanlash kolleksiyasi: uchta o‘yin seriyasi va ikkala mashq liniyasidagi har bir vazn, uzunlik va zavod dastasi kombinatsiyasidan ikkitadan.",
    "Individual tanlash kam uchraydigan katta dastalarga muhtoj odamlarni ham qamrab olishi kerak. Maqsad — L6 va L7 kabi mos zavod o‘lchamlariga kirish imkoniyati, shunda kam uchraydigan qo‘l o‘lchamlari ham hisobga olinadi.",
    "Individual uzunliklar alohida ko‘rib chiqiladi va bu matritsaga kirmaydi. Aniqlik sinflari bu sonni ko‘paytirmaydi.",
    "Rejalashtirish va muhokama uchun kolleksiya spetsifikatsiyasi. U ombor zaxirasi, ishlab chiqarishga tayyorlik, sotuv yoki yetkazib berishni tasdiqlamaydi; texnik tasdiq va tijoriy shartlar alohida kelishiladi.",
    "Tarixiy asosiy spetsifikatsiya",
    "Vazn × uzunlik variantlari"
  ],
  kk: [
    "National Package · Елге арналған жинақ",
    "Әр ел үшін ұсынылатын эталондық және жеке таңдау жинағы: үш ойын сериясы мен екі жаттығу желісіндегі салмақ, ұзындық және зауыттық тұтқаның әр комбинациясынан екі данадан.",
    "Жеке таңдау сирек кездесетін үлкен тұтқалар қажет адамдарды да қамтуы керек. Мақсат — L6 және L7 қоса алғанда, сәйкес зауыттық өлшемдерге қолжетімділік, осылайша сирек қол өлшемдері де ескеріледі.",
    "Жеке ұзындықтар бөлек қаралады және бұл матрицаға кірмейді. Дәлдік кластары бұл санды көбейтпейді.",
    "Жоспарлау мен талқылауға арналған жинақ сипаттамасы. Ол қойма қорын, өндірістік дайындықты, сатуды немесе жеткізуді растамайды; техникалық мақұлдау мен коммерциялық шарттар бөлек келісіледі.",
    "Тарихи базалық сипаттама",
    "Салмақ × ұзындық нұсқалары"
  ],
  ar: [
    "National Package · مجموعة لكل دولة",
    "مجموعة مرجعية مقترحة للتجربة والاختيار الفردي في كل دولة: نسختان من كل تركيبة من الوزن والطول ومقاس المقبض المصنعي ضمن سلاسل اللعب الثلاث وخطي التدريب.",
    "ينبغي أن يشمل الاختيار الفردي الأشخاص الذين يحتاجون إلى مقابض كبيرة أقل شيوعًا. الهدف هو إتاحة المقاسات المصنعية المناسبة، ومنها L6 وL7، بحيث تؤخذ مقاسات اليد غير الشائعة في الحسبان أيضًا.",
    "تُراجع الأطوال المخصصة بصورة منفصلة وتقع خارج هذه المصفوفة. لا تُضاعف فئات الدقة هذا العدد.",
    "مواصفات مجموعة للتخطيط والمناقشة. لا تؤكد مخزونًا أو جاهزية إنتاج أو بيعًا أو تسليمًا؛ وتُتفق الموافقة الفنية والشروط التجارية بصورة منفصلة.",
    "المواصفات الأساسية التاريخية",
    "خيارات الوزن × الطول"
  ],
  hi: [
    "National Package · प्रत्येक देश का संग्रह",
    "हर देश के लिए प्रस्तावित संदर्भ और व्यक्तिगत चयन संग्रह: तीनों खेल श्रृंखलाओं और दोनों प्रशिक्षण लाइनों में वजन, लंबाई और फैक्टरी ग्रिप के हर संयोजन की दो प्रतियाँ।",
    "व्यक्तिगत चयन में उन लोगों को भी शामिल करना चाहिए जिन्हें कम मिलने वाली बड़ी ग्रिप चाहिए। उद्देश्य L6 और L7 सहित उपयुक्त फैक्टरी आकारों तक पहुँच है, ताकि कम सामान्य हाथ के आकार भी ध्यान में रखे जाएँ।",
    "विशेष लंबाइयों की अलग समीक्षा होती है और वे इस मैट्रिक्स में शामिल नहीं हैं। सटीकता वर्ग इस गिनती को गुणा नहीं करते।",
    "योजना और चर्चा के लिए संग्रह विनिर्देश। यह स्टॉक, उत्पादन की तैयारी, बिक्री या डिलीवरी की पुष्टि नहीं करता; तकनीकी स्वीकृति और व्यावसायिक शर्तें अलग तय होती हैं।",
    "ऐतिहासिक आधार विनिर्देश",
    "वजन × लंबाई के विकल्प"
  ],
  id: [
    "National Package · Koleksi per negara",
    "Usulan koleksi referensi dan pencocokan individual untuk setiap negara: dua unit dari setiap kombinasi berat, panjang, dan grip pabrik pada tiga seri bermain dan kedua lini latihan.",
    "Pencocokan individual juga harus mencakup orang yang memerlukan grip besar yang jarang ditemukan. Tujuannya adalah akses ke ukuran pabrik yang sesuai, termasuk L6 dan L7, agar ukuran tangan yang kurang umum turut diperhitungkan.",
    "Panjang khusus ditinjau secara terpisah dan berada di luar matriks ini. Kelas presisi tidak mengalikan jumlah ini.",
    "Spesifikasi koleksi untuk perencanaan dan pembahasan. Tidak mengonfirmasi stok, kesiapan produksi, penjualan, atau pengiriman; persetujuan teknis dan ketentuan komersial disepakati terpisah.",
    "Spesifikasi dasar historis",
    "Varian berat × panjang"
  ],
  fil: [
    "National Package · Koleksiyon para sa bansa",
    "Iminungkahing koleksiyon ng sanggunian at pansariling pagpili para sa bawat bansa: dalawang halimbawa ng bawat kombinasyon ng timbang, haba at hawakang gawa sa pabrika sa tatlong serye ng paglalaro at dalawang linya ng pagsasanay.",
    "Dapat ding isama sa pansariling pagpili ang mga nangangailangan ng bihirang malalaking hawakan. Layunin ang pag-access sa angkop na laki mula sa pabrika, kabilang ang L6 at L7, upang maisaalang-alang din ang di-karaniwang laki ng kamay.",
    "Hiwalay na sinusuri ang pasadyang haba at hindi ito kabilang sa matris na ito. Hindi nagpaparami sa bilang na ito ang mga klase ng katumpakan.",
    "Espesipikasyon ng koleksiyon para sa pagpaplano at talakayan. Hindi nito kinukumpirma ang imbentaryo, kahandaan sa produksiyon, pagbebenta o paghahatid; hiwalay na pinagkakasunduan ang teknikal na pag-apruba at komersiyal na mga kondisyon.",
    "Makasaysayang batayang espesipikasyon",
    "Mga variant ng timbang × haba"
  ],
  th: [
    "National Package · ชุดสำหรับแต่ละประเทศ",
    "ข้อเสนอชุดอ้างอิงและทดลองเลือกให้เหมาะกับแต่ละคนในทุกประเทศ: น้ำหนัก ความยาว และขนาดด้ามจากโรงงานทุกชุดผสมอย่างละสองชิ้น ครอบคลุมไม้เล่นทั้งสามซีรีส์และอุปกรณ์ฝึกทั้งสองกลุ่ม",
    "การเลือกเฉพาะบุคคลควรครอบคลุมผู้ที่ต้องการด้ามขนาดใหญ่ที่พบไม่บ่อยด้วย เป้าหมายคือการเข้าถึงขนาดจากโรงงานที่เหมาะสม รวมถึง L6 และ L7 เพื่อให้คำนึงถึงขนาดมือที่ไม่ใช่ขนาดทั่วไปด้วย",
    "ความยาวสั่งทำจะได้รับการพิจารณาแยกต่างหากและไม่รวมอยู่ในตารางนี้ ระดับความแม่นยำไม่ใช่ตัวคูณของจำนวนนี้",
    "ข้อกำหนดชุดสำหรับการวางแผนและหารือ ไม่ยืนยันสินค้าคงคลัง ความพร้อมในการผลิต การขาย หรือการจัดส่ง การอนุมัติทางเทคนิคและเงื่อนไขทางการค้าต้องตกลงแยกต่างหาก",
    "ข้อกำหนดพื้นฐานเดิม",
    "ตัวเลือกน้ำหนัก × ความยาว"
  ],
  ja: [
    "National Package · 国別コレクション",
    "各国向けに提案する、比較・試打と個別フィッティングのためのコレクションです。競技用3シリーズと両トレーナーの、重量・長さ・工場製グリップサイズの各組み合わせを2本ずつ含みます。",
    "個別フィッティングでは、珍しい大きなグリップを必要とする方も考慮します。L6やL7を含む適切な工場製サイズを選べることを目指し、一般的でない手の大きさも選択の対象にします。",
    "特注の長さは別途審査し、この組み合わせ表には含みません。精度クラスをこの数量の倍率にはしません。",
    "計画と協議のためのコレクション仕様です。在庫、生産準備、販売、納品を確約するものではありません。技術承認と取引条件は別途合意します。",
    "従来の基準仕様",
    "重量 × 長さの組み合わせ"
  ],
  ko: [
    "National Package · 국가별 컬렉션",
    "각 국가에 제안하는 비교 및 개인별 피팅 컬렉션입니다. 세 가지 경기용 시리즈와 두 트레이너 라인의 모든 무게·길이·공장 제작 그립 조합을 각각 두 개씩 포함합니다.",
    "개인별 피팅은 흔하지 않은 큰 그립이 필요한 사람도 고려해야 합니다. L6와 L7을 포함한 적합한 공장 제작 크기를 선택할 수 있도록 하여 드문 손 크기도 선택 범위에 포함하는 것이 목표입니다.",
    "맞춤 길이는 별도로 검토하며 이 조합표에 포함하지 않습니다. 정밀도 등급은 이 수량의 배수가 아닙니다.",
    "계획과 협의를 위한 컬렉션 사양입니다. 재고, 생산 준비, 판매 또는 납품을 확정하지 않으며 기술 승인과 상업 조건은 별도로 합의합니다.",
    "기존 기준 사양",
    "무게 × 길이 조합"
  ],
  zh: [
    "National Package · 国家配置套装",
    "为每个国家提出的参考与个性化试配收藏方案：三大比赛球拍系列及两条训练器产品线中，每种重量、长度和原厂握把尺寸组合各两支。",
    "个性化试配也应考虑需要少见大号握把的人。目标是让人们能够选择合适的原厂尺寸，包括 L6 和 L7，使较少见的手部尺寸也得到考虑。",
    "定制长度单独进行技术审核，不计入此矩阵。精度等级不作为此数量的乘数。",
    "本套装规格用于规划和讨论，不代表现货、生产就绪、销售或交付承诺；技术批准和商业条件须另行商定。",
    "历史基础规格",
    "重量 × 长度组合"
  ],
  cs: [
    "National Package · Kolekce pro zemi",
    "Navrhovaná referenční kolekce pro seznámení a individuální výběr v každé zemi: dva kusy každé kombinace hmotnosti, délky a tovární rukojeti ve všech třech herních řadách a obou tréninkových řadách.",
    "Individuální výběr má zahrnovat i lidi, kteří potřebují vzácnější větší rukojeti. Cílem je přístup k vhodným továrním velikostem včetně L6 a L7, aby se zohlednily i méně obvyklé velikosti rukou.",
    "Individuální délky se posuzují samostatně a nejsou součástí této matice. Třídy přesnosti tento počet nenásobí.",
    "Specifikace kolekce pro plánování a diskusi. Nepotvrzuje skladové zásoby, připravenost výroby, prodej ani dodání; technické schválení a obchodní podmínky se sjednávají samostatně.",
    "Historická základní specifikace",
    "Varianty hmotnosti × délky"
  ],
  sl: [
    "National Package · Zbirka za državo",
    "Predlagana referenčna zbirka za spoznavanje in individualno izbiro v vsaki državi: po dva primerka vsake kombinacije teže, dolžine in tovarniškega ročaja v vseh treh igralnih serijah in obeh vadbenih linijah.",
    "Individualna izbira mora vključevati tudi ljudi, ki potrebujejo redke večje ročaje. Cilj je dostop do ustreznih tovarniških velikosti, vključno z L6 in L7, da se upoštevajo tudi manj običajne velikosti rok.",
    "Dolžine po meri se obravnavajo ločeno in niso del te matrike. Razredi natančnosti tega števila ne pomnožijo.",
    "Specifikacija zbirke za načrtovanje in razpravo. Ne potrjuje zalog, pripravljenosti proizvodnje, prodaje ali dobave; tehnična odobritev in komercialni pogoji se dogovorijo ločeno.",
    "Zgodovinska osnovna specifikacija",
    "Različice teže × dolžine"
  ],
  bs: [
    "National Package · Kolekcija za zemlju",
    "Predložena referentna kolekcija za upoznavanje i individualni izbor u svakoj zemlji: po dva primjerka svake kombinacije težine, dužine i fabričke drške u sve tri igračke serije i obje linije za trening.",
    "Individualni izbor treba obuhvatiti i ljude kojima trebaju rijetke veće drške. Cilj je pristup odgovarajućim fabričkim veličinama, uključujući L6 i L7, kako bi se uvažile i manje uobičajene veličine šake.",
    "Dužine po mjeri razmatraju se zasebno i nisu dio ove matrice. Klase preciznosti ne umnožavaju ovaj broj.",
    "Specifikacija kolekcije za planiranje i razgovor. Ne potvrđuje zalihe, spremnost proizvodnje, prodaju ili isporuku; tehničko odobrenje i komercijalni uslovi dogovaraju se zasebno.",
    "Historijska osnovna specifikacija",
    "Varijante težine × dužine"
  ],
  mk: [
    "National Package · Колекција за земјата",
    "Предложена референтна колекција за запознавање и индивидуален избор во секоја земја: по два примерока од секоја комбинација на тежина, должина и фабричка рачка во сите три серии за игра и двете линии за тренинг.",
    "Индивидуалниот избор треба да ги опфати и луѓето на кои им требаат ретки поголеми рачки. Целта е пристап до соодветни фабрички големини, вклучувајќи L6 и L7, за да се земат предвид и помалку вообичаените големини на раката.",
    "Индивидуалните должини се разгледуваат одделно и не се дел од оваа матрица. Класите на прецизност не го множат овој број.",
    "Спецификација на колекцијата за планирање и разговор. Не потврдува залихи, производствена подготвеност, продажба или испорака; техничкото одобрување и комерцијалните услови се договараат одделно.",
    "Историска основна спецификација",
    "Варијанти на тежина × должина"
  ],
  sq: [
    "National Package · Koleksion për vendin",
    "Një koleksion referimi dhe përshtatjeje individuale i propozuar për çdo vend: nga dy ekzemplarë të çdo kombinimi peshe, gjatësie dhe doreze fabrike në tri seritë e lojës dhe të dyja linjat e stërvitjes.",
    "Përshtatja individuale duhet të përfshijë edhe njerëzit që kanë nevojë për doreza të mëdha më të rralla. Qëllimi është qasja në madhësi të përshtatshme fabrike, përfshirë L6 dhe L7, duke marrë parasysh edhe përmasat më pak të zakonshme të dorës.",
    "Gjatësitë e personalizuara shqyrtohen veçmas dhe janë jashtë kësaj matrice. Klasat e saktësisë nuk e shumëzojnë këtë numër.",
    "Specifikim koleksioni për planifikim dhe diskutim. Nuk konfirmon stok, gatishmëri prodhimi, shitje ose dorëzim; miratimi teknik dhe kushtet tregtare bien dakord veçmas.",
    "Specifikimi bazë historik",
    "Variantet peshë × gjatësi"
  ],
  da: [
    "National Package · Landesamling",
    "En foreslået reference- og tilpasningssamling til hvert land: to eksemplarer af hver kombination af vægt, længde og fabriksgreb i de tre spilleserier og begge træningslinjer.",
    "Individuel tilpasning skal også omfatte personer, som har brug for usædvanlige større greb. Målet er adgang til passende fabriksstørrelser, herunder L6 og L7, så også mindre almindelige håndstørrelser indgår.",
    "Specialtilpassede længder vurderes separat og er uden for denne matrix. Præcisionsklasserne mangedobler ikke dette antal.",
    "Samlingsspecifikation til planlægning og drøftelse. Den bekræfter ikke lager, produktionsparathed, salg eller levering; teknisk godkendelse og kommercielle vilkår aftales særskilt.",
    "Historisk grundspecifikation",
    "Varianter af vægt × længde"
  ],
  fi: [
    "National Package · Maakohtainen kokoelma",
    "Jokaiseen maahan ehdotettu vertailu- ja sovituskokoelma: kaksi kappaletta jokaista painon, pituuden ja tehdaskahvan yhdistelmää kaikista kolmesta pelisarjasta ja molemmista harjoittelulinjoista.",
    "Yksilöllisessä sovituksessa tulee huomioida myös harvinaisempia suuria kahvoja tarvitsevat ihmiset. Tavoitteena on sopivien tehdaskokojen, myös L6:n ja L7:n, saatavuuden edistäminen, jotta myös epätavallisemmat käsikoot otetaan huomioon.",
    "Yksilölliset pituudet arvioidaan erikseen, eivätkä ne sisälly tähän matriisiin. Tarkkuusluokat eivät moninkertaista tätä lukumäärää.",
    "Kokoelman määrittely suunnittelua ja keskustelua varten. Se ei vahvista varastoa, tuotantovalmiutta, myyntiä tai toimitusta; tekninen hyväksyntä ja kaupalliset ehdot sovitaan erikseen.",
    "Historiallinen perusmäärittely",
    "Painon × pituuden vaihtoehdot"
  ],
  is: [
    "National Package · Safn fyrir hvert land",
    "Tillaga að viðmiðunar- og mátunarsafni fyrir hvert land: tvö eintök af hverri samsetningu þyngdar, lengdar og verksmiðjugrips í öllum þremur leiklínunum og báðum æfingalínunum.",
    "Einstaklingsmiðuð mátun á einnig að taka mið af fólki sem þarf sjaldgæf stærri grip. Markmiðið er aðgengi að viðeigandi verksmiðjustærðum, þar á meðal L6 og L7, svo einnig sé tekið tillit til óalgengari handastærða.",
    "Sérsmíðaðar lengdir eru metnar sérstaklega og eru utan þessa fylkis. Nákvæmniflokkar margfalda ekki þennan fjölda.",
    "Safnlýsing fyrir skipulagningu og umræðu. Hún staðfestir ekki birgðir, framleiðsluhæfi, sölu eða afhendingu; um tæknilegt samþykki og viðskiptaskilmála er samið sérstaklega.",
    "Eldri grunnforskrift",
    "Útfærslur þyngdar × lengdar"
  ],
  ga: [
    "National Package · Bailiúchán do gach tír",
    "Bailiúchán tagartha agus feistithe atá molta do gach tír: dhá shampla de gach meascán meáchain, faid agus greim monarchan sna trí shraith imeartha agus sa dá líne traenála.",
    "Ba cheart go gcuimseodh feistiú aonair daoine a dteastaíonn greamanna móra neamhchoitianta uathu. Is é an aidhm rochtain ar mhéideanna monarchan oiriúnacha, L6 agus L7 san áireamh, ionas go gcuirfear méideanna láimhe níos annamha san áireamh freisin.",
    "Déantar athbhreithniú ar fhaid shaincheaptha ar leithligh agus tá siad lasmuigh den mhaitrís seo. Ní iolraíonn na haicmí beachtais an comhaireamh seo.",
    "Sonraíocht bailiúcháin le haghaidh pleanála agus plé. Ní dhearbhaíonn sí stoc, ullmhacht táirgthe, díol ná seachadadh; comhaontaítear ceadú teicniúil agus téarmaí tráchtála ar leithligh.",
    "Sonraíocht bhunlíne stairiúil",
    "Leaganacha meáchain × faid"
  ],
  et: [
    "National Package · Riigi kollektsioon",
    "Igale riigile kavandatav võrdlus- ja sobituskollektsioon: kaks eksemplari iga kaalu, pikkuse ja tehasekäepideme kombinatsioonist kõigis kolmes mänguseerias ja mõlemas treeningusarjas.",
    "Individuaalne sobitamine peab arvestama ka inimestega, kes vajavad haruldasi suuremaid käepidemeid. Eesmärk on juurdepääs sobivatele tehasesuurustele, sealhulgas L6 ja L7, et ka vähem levinud käesuurused oleksid arvesse võetud.",
    "Eritellimuse pikkusi hinnatakse eraldi ja need ei kuulu sellesse maatriksisse. Täpsusklassid seda arvu ei korruta.",
    "Kollektsiooni kirjeldus planeerimiseks ja aruteluks. See ei kinnita laoseisu, tootmisvalmidust, müüki ega tarnet; tehniline heakskiit ja äritingimused lepitakse kokku eraldi.",
    "Ajalooline baas-spetsifikatsioon",
    "Kaalu × pikkuse variandid"
  ],
  lv: [
    "National Package · Kolekcija katrai valstij",
    "Ierosināta atsauces un individuālās piemeklēšanas kolekcija katrai valstij: pa diviem eksemplāriem no katras svara, garuma un rūpnīcas roktura kombinācijas visās trīs spēles sērijās un abās treniņu līnijās.",
    "Individuālai piemeklēšanai jāietver arī cilvēki, kuriem nepieciešami retāk sastopami lieli rokturi. Mērķis ir piekļuve piemērotiem rūpnīcas izmēriem, tostarp L6 un L7, lai tiktu ņemti vērā arī mazāk ierasti plaukstas izmēri.",
    "Individuālos garumus izvērtē atsevišķi, un tie neietilpst šajā matricā. Precizitātes klases šo skaitu nereizina.",
    "Kolekcijas specifikācija plānošanai un apspriešanai. Tā neapstiprina krājumus, ražošanas gatavību, pārdošanu vai piegādi; tehnisko apstiprinājumu un komerciālos noteikumus saskaņo atsevišķi.",
    "Vēsturiskā pamata specifikācija",
    "Svara × garuma varianti"
  ],
  lt: [
    "National Package · Kolekcija šaliai",
    "Kiekvienai šaliai siūloma pavyzdinė ir individualaus parinkimo kolekcija: po du kiekvieno svorio, ilgio ir gamyklinės rankenos derinio egzempliorius visose trijose žaidimo serijose ir abiejose treniruočių linijose.",
    "Individualus parinkimas turi apimti ir žmones, kuriems reikia retų didesnių rankenų. Tikslas — prieiga prie tinkamų gamyklinių dydžių, įskaitant L6 ir L7, kad būtų atsižvelgta ir į rečiau pasitaikančius plaštakos dydžius.",
    "Individualūs ilgiai vertinami atskirai ir neįtraukiami į šią matricą. Tikslumo klasės šio skaičiaus nedaugina.",
    "Kolekcijos specifikacija planavimui ir aptarimui. Ji nepatvirtina atsargų, gamybos parengties, pardavimo ar pristatymo; techninis patvirtinimas ir komercinės sąlygos derinami atskirai.",
    "Istorinė bazinė specifikacija",
    "Svorio × ilgio variantai"
  ],
  mt: [
    "National Package · Kollezzjoni għal kull pajjiż",
    "Kollezzjoni ta’ referenza u għażla individwali proposta għal kull pajjiż: żewġ eżemplari ta’ kull kombinazzjoni ta’ piż, tul u manku tal-fabbrika fit-tliet serje tal-logħob u fiż-żewġ linji tat-taħriġ.",
    "L-għażla individwali għandha tinkludi wkoll lil min jeħtieġ manki kbar li mhumiex komuni. L-għan huwa aċċess għal daqsijiet tal-fabbrika adattati, inklużi L6 u L7, sabiex jitqiesu wkoll daqsijiet tal-id inqas komuni.",
    "It-tulijiet apposta jiġu evalwati separatament u mhumiex parti minn din il-matriċi. Il-klassijiet ta’ preċiżjoni ma jimmultiplikawx dan l-għadd.",
    "Speċifikazzjoni tal-kollezzjoni għall-ippjanar u d-diskussjoni. Ma tikkonfermax stokk, tħejjija għall-produzzjoni, bejgħ jew kunsinna; l-approvazzjoni teknika u l-kundizzjonijiet kummerċjali jiġu miftiehma separatament.",
    "Speċifikazzjoni bażi storika",
    "Varjanti ta’ piż × tul"
  ],
  ca: [
    "National Package · Col·lecció per país",
    "Una col·lecció de referència i ajust proposada per a cada país: dos exemplars de cada combinació de pes, llargada i mànec de fàbrica de les tres sèries de joc i les dues línies d’entrenament.",
    "L’ajust individual també ha d’incloure les persones que necessiten mànecs grans poc habituals. L’objectiu és l’accés a mides de fàbrica adequades, incloses L6 i L7, tenint en compte les mides de mà menys comunes.",
    "Les llargades a mida es revisen per separat i queden fora d’aquesta matriu. Les classes de precisió no multipliquen aquest recompte.",
    "Especificació de la col·lecció per planificar i debatre. No confirma estoc, preparació per produir, venda ni lliurament; l’aprovació tècnica i les condicions comercials s’acorden per separat.",
    "Especificació històrica de referència",
    "Variants de pes × llargada"
  ],
  eu: [
    "National Package · Herrialde bakoitzeko bilduma",
    "Herrialde bakoitzerako proposatutako erreferentziazko eta banakako egokitzapeneko bilduma: pisuaren, luzeraren eta fabrikako heldulekuaren konbinazio bakoitzeko bi ale, jokorako hiru serieetan eta bi entrenamendu-lerroetan.",
    "Banakako egokitzapenak helduleku handi ezohikoak behar dituzten pertsonak ere hartu behar ditu kontuan. Helburua fabrikako neurri egokietara iristea da, L6 eta L7 barne, ezohiko esku-neurriak ere aukeraketan sartzeko.",
    "Neurrira egindako luzerak bereiz aztertzen dira eta matrize honetatik kanpo daude. Zehaztasun-klaseek ez dute kopuru hau biderkatzen.",
    "Plangintzarako eta eztabaidarako bildumaren zehaztapena. Ez du stockik, ekoizpenerako prestasunik, salmentarik edo entregarik baieztatzen; onespen teknikoa eta merkataritza-baldintzak bereiz adosten dira.",
    "Oinarrizko zehaztapen historikoa",
    "Pisuaren × luzeraren aldaerak"
  ],
  gl: [
    "National Package · Colección por país",
    "Unha colección de referencia e axuste proposta para cada país: dous exemplares de cada combinación de peso, lonxitude e empuñadura de fábrica das tres series de xogo e das dúas liñas de adestramento.",
    "O axuste individual tamén debe incluír as persoas que precisan empuñaduras grandes pouco habituais. O obxectivo é o acceso a tamaños de fábrica axeitados, incluídos L6 e L7, tendo en conta os tamaños de man menos comúns.",
    "As lonxitudes á medida revísanse por separado e quedan fóra desta matriz. As clases de precisión non multiplican este reconto.",
    "Especificación da colección para planificación e debate. Non confirma existencias, preparación para producir, venda nin entrega; a aprobación técnica e as condicións comerciais acórdanse por separado.",
    "Especificación histórica de referencia",
    "Variantes de peso × lonxitude"
  ]
};

/** Concept and illustrative orders, distinct from the finite per-country reference matrix. */
const lifecycleRows = {
  en: [
    "Intended as a permanent reference and fitting library, separate from sales stock: stable matte-black base configurations provide references for repeat orders, custom designs and sub-brands.",
    "Personal package example: 6 playing racquets, 4 or 5 Spot Trainers and 4 or 5 Sweet Spot Trainers, all at the same chosen length. This illustrates an individual selection, not a standard quantity for every player.",
    "Custom batches of 100–200 units are examples for discussion, not a universal minimum order. Design, specifications and batch conditions require separate agreement.",
    "MAXIMUS Pro Shop is an architectural concept for a tennis concept club: automated tray storage, selection, retrieval and returns. Engineering feasibility, capacity and certification are not yet established."
  ],
  ru: [
    "Замысел — постоянная эталонная библиотека для индивидуального подбора, отдельная от товарного склада. Стабильные базовые конфигурации в матовом чёрном исполнении служат образцами для повторных заказов, индивидуальных дизайнов и суббрендов.",
    "Пример личного комплекта: 6 игровых ракеток, 4 или 5 Spot Trainer и 4 или 5 Sweet Spot Trainer — все одной выбранной длины. Это иллюстрация индивидуального подбора, а не стандартное количество для каждого игрока.",
    "Заказные партии по 100–200 единиц — примеры для обсуждения, а не универсальный минимальный заказ. Дизайн, характеристики и условия партии согласуются отдельно.",
    "MAXIMUS Pro Shop — архитектурная концепция для теннисного концепт-клуба: автоматизированное хранение на лотках, выбор, выдача и возврат. Инженерная выполнимость, вместимость и сертификация пока не подтверждены."
  ],
  uk: [
    "Задум — постійна еталонна бібліотека для індивідуального підбору, окрема від товарного складу. Стабільні базові конфігурації в матовому чорному виконанні слугують зразками для повторних замовлень, індивідуальних дизайнів і суббрендів.",
    "Приклад особистого комплекту: 6 ігрових ракеток, 4 або 5 Spot Trainer і 4 або 5 Sweet Spot Trainer — усі однієї вибраної довжини. Це ілюстрація індивідуального підбору, а не стандартна кількість для кожного гравця.",
    "Замовні партії по 100–200 одиниць — приклади для обговорення, а не універсальне мінімальне замовлення. Дизайн, характеристики та умови партії погоджуються окремо.",
    "MAXIMUS Pro Shop — архітектурна концепція для тенісного концепт-клубу: автоматизоване зберігання на лотках, вибір, видача й повернення. Інженерна здійсненність, місткість і сертифікація поки не підтверджені."
  ],
  be: [
    "Задума — пастаянная эталонная бібліятэка для індывідуальнага падбору, асобная ад таварнага склада. Стабільныя базавыя канфігурацыі ў матавым чорным выкананні служаць узорамі для паўторных заказаў, індывідуальных дызайнаў і суббрэндаў.",
    "Прыклад асабістага камплекта: 6 гульнявых ракетак, 4 або 5 Spot Trainer і 4 або 5 Sweet Spot Trainer — усе адной выбранай даўжыні. Гэта ілюстрацыя індывідуальнага падбору, а не стандартная колькасць для кожнага гульца.",
    "Заказныя партыі па 100–200 адзінак — прыклады для абмеркавання, а не ўніверсальны мінімальны заказ. Дызайн, характарыстыкі і ўмовы партыі ўзгадняюцца асобна.",
    "MAXIMUS Pro Shop — архітэктурная канцэпцыя для тэніснага канцэпт-клуба: аўтаматызаванае захоўванне на латках, выбар, выдача і вяртанне. Інжынерная выканальнасць, змяшчальнасць і сертыфікацыя пакуль не пацверджаныя."
  ],
  de: [
    "Geplant ist eine dauerhafte Referenz- und Fittingbibliothek, getrennt vom Verkaufsbestand. Beständige mattschwarze Basiskonfigurationen dienen als Referenz für Nachbestellungen, individuelle Designs und Untermarken.",
    "Beispiel eines persönlichen Pakets: 6 Spielschläger, 4 oder 5 Spot Trainer und 4 oder 5 Sweet Spot Trainer, alle in derselben gewählten Länge. Das veranschaulicht eine individuelle Auswahl, keine Standardmenge für alle Spieler.",
    "Individuelle Chargen von 100–200 Stück sind Diskussionsbeispiele, keine allgemeine Mindestbestellmenge. Design, Spezifikationen und Chargenbedingungen werden gesondert vereinbart.",
    "MAXIMUS Pro Shop ist ein Architekturkonzept für einen Tennis-Konzeptclub: automatisierte Lagerung in Trays, Auswahl, Ausgabe und Rückgabe. Technische Machbarkeit, Kapazität und Zertifizierung sind noch nicht nachgewiesen."
  ],
  nl: [
    "Bedoeld als een permanente referentie- en pasbibliotheek, los van de verkoopvoorraad. Vaste matzwarte basisconfiguraties vormen de referentie voor herhaalbestellingen, eigen ontwerpen en submerken.",
    "Voorbeeld van een persoonlijk pakket: 6 speelrackets, 4 of 5 Spot Trainers en 4 of 5 Sweet Spot Trainers, allemaal met dezelfde gekozen lengte. Dit toont een individuele keuze, geen standaardhoeveelheid voor iedere speler.",
    "Maatwerkpartijen van 100–200 stuks zijn voorbeelden ter bespreking, geen algemene minimale bestelling. Ontwerp, specificaties en partijvoorwaarden worden apart afgesproken.",
    "MAXIMUS Pro Shop is een architectuurconcept voor een tennisconceptclub: geautomatiseerde opslag in trays, selectie, uitgifte en retourname. Technische haalbaarheid, capaciteit en certificering zijn nog niet vastgesteld."
  ],
  fr: [
    "Le projet prévoit une bibliothèque permanente de référence et d’essai, distincte du stock de vente. Des configurations de base stables en noir mat servent de références pour les commandes répétées, les designs personnalisés et les sous-marques.",
    "Exemple de lot personnel : 6 raquettes de jeu, 4 ou 5 Spot Trainer et 4 ou 5 Sweet Spot Trainer, tous de la même longueur choisie. Il s’agit d’une sélection individuelle illustrative, pas d’une quantité standard pour chaque joueur.",
    "Les lots personnalisés de 100–200 unités sont des exemples à discuter, pas un minimum universel de commande. Le design, les spécifications et les conditions du lot font l’objet d’un accord séparé.",
    "MAXIMUS Pro Shop est un concept architectural pour un club de tennis conceptuel : stockage automatisé sur plateaux, sélection, remise et retour. La faisabilité technique, la capacité et la certification restent à établir."
  ],
  es: [
    "Se propone una biblioteca permanente de referencia y ajuste, separada del inventario de venta. Las configuraciones base estables en negro mate sirven de referencia para pedidos repetidos, diseños personalizados y submarcas.",
    "Ejemplo de paquete personal: 6 raquetas de juego, 4 o 5 Spot Trainer y 4 o 5 Sweet Spot Trainer, todos de la misma longitud elegida. Ilustra una selección individual, no una cantidad estándar para cada jugador.",
    "Los lotes personalizados de 100–200 unidades son ejemplos para comentar, no un pedido mínimo universal. El diseño, las especificaciones y las condiciones del lote se acuerdan por separado.",
    "MAXIMUS Pro Shop es un concepto arquitectónico para un club conceptual de tenis: almacenamiento automatizado en bandejas, selección, entrega y devolución. La viabilidad técnica, la capacidad y la certificación aún no están establecidas."
  ],
  it: [
    "È prevista una biblioteca permanente di riferimento e prova, distinta dalle scorte destinate alla vendita. Configurazioni di base stabili in nero opaco fungono da riferimento per ordini ripetuti, design personalizzati e sottomarchi.",
    "Esempio di pacchetto personale: 6 racchette da gioco, 4 o 5 Spot Trainer e 4 o 5 Sweet Spot Trainer, tutti della stessa lunghezza scelta. Illustra una selezione individuale, non una quantità standard per ogni giocatore.",
    "I lotti personalizzati da 100–200 unità sono esempi da discutere, non un ordine minimo universale. Design, specifiche e condizioni del lotto richiedono un accordo separato.",
    "MAXIMUS Pro Shop è un concetto architettonico per un circolo di tennis concettuale: stoccaggio automatizzato su vassoi, selezione, consegna e restituzione. Fattibilità tecnica, capacità e certificazione non sono ancora stabilite."
  ],
  pt: [
    "Pretende-se uma biblioteca permanente de referência e ajuste, separada do stock para venda. Configurações base estáveis em preto mate servem de referência para encomendas repetidas, designs personalizados e submarcas.",
    "Exemplo de conjunto pessoal: 6 raquetes de jogo, 4 ou 5 Spot Trainer e 4 ou 5 Sweet Spot Trainer, todos com o mesmo comprimento escolhido. Ilustra uma seleção individual, não uma quantidade padrão para cada jogador.",
    "Lotes personalizados de 100–200 unidades são exemplos para discussão, não uma encomenda mínima universal. O design, as especificações e as condições do lote são acordados separadamente.",
    "MAXIMUS Pro Shop é um conceito arquitetónico para um clube conceptual de ténis: armazenamento automatizado em tabuleiros, seleção, entrega e devolução. A viabilidade técnica, a capacidade e a certificação ainda não estão estabelecidas."
  ],
  pl: [
    "Planowana jest stała biblioteka wzorcowa do indywidualnego dopasowania, oddzielona od zapasów na sprzedaż. Stabilne konfiguracje bazowe w matowej czerni służą jako wzorce dla ponownych zamówień, indywidualnych projektów i submarek.",
    "Przykład osobistego zestawu: 6 rakiet do gry, 4 lub 5 Spot Trainer i 4 lub 5 Sweet Spot Trainer, wszystkie o tej samej wybranej długości. To ilustracja indywidualnego doboru, a nie standardowa liczba dla każdego gracza.",
    "Indywidualne partie po 100–200 sztuk są przykładami do omówienia, a nie uniwersalnym minimalnym zamówieniem. Projekt, specyfikacje i warunki partii uzgadnia się oddzielnie.",
    "MAXIMUS Pro Shop to koncepcja architektoniczna koncepcyjnego klubu tenisowego: automatyczne przechowywanie na tacach, wybór, wydawanie i zwroty. Wykonalność techniczna, pojemność i certyfikacja nie zostały jeszcze potwierdzone."
  ],
  hu: [
    "A terv egy állandó referencia- és illesztési tár, elkülönítve az értékesítési készlettől. A stabil, matt fekete alapkonfigurációk ismételt rendelések, egyedi dizájnok és almárkák referenciái.",
    "Példa személyes csomagra: 6 játékütő, 4 vagy 5 Spot Trainer és 4 vagy 5 Sweet Spot Trainer, mind azonos választott hosszúságban. Ez egyéni választást szemléltet, nem minden játékosra érvényes darabszámot.",
    "A 100–200 darabos egyedi sorozatok egyeztetési példák, nem általános minimális rendelési mennyiségek. A dizájnt, a specifikációkat és a sorozat feltételeit külön kell egyeztetni.",
    "A MAXIMUS Pro Shop egy koncepcióalapú teniszklub építészeti elképzelése: automatizált tálcás tárolás, kiválasztás, kiadás és visszavétel. A műszaki megvalósíthatóság, kapacitás és tanúsítás még nem igazolt."
  ],
  sk: [
    "Zámerom je trvalá referenčná knižnica na individuálny výber, oddelená od predajných zásob. Stabilné základné konfigurácie v matnej čiernej slúžia ako vzory pre opakované objednávky, vlastné dizajny a podznačky.",
    "Príklad osobného balíka: 6 herných rakiet, 4 alebo 5 Spot Trainer a 4 alebo 5 Sweet Spot Trainer, všetky s rovnakou vybranou dĺžkou. Ide o ukážku individuálneho výberu, nie štandardný počet pre každého hráča.",
    "Zákazkové série po 100–200 kusoch sú príklady na diskusiu, nie všeobecná minimálna objednávka. Dizajn, špecifikácie a podmienky série sa dohodnú osobitne.",
    "MAXIMUS Pro Shop je architektonický koncept koncepčného tenisového klubu: automatizované ukladanie do zásobníkov, výber, výdaj a vrátenie. Technická uskutočniteľnosť, kapacita a certifikácia zatiaľ nie sú potvrdené."
  ],
  hr: [
    "Zamišljena je trajna referentna zbirka za individualni odabir, odvojena od prodajnih zaliha. Stabilne osnovne konfiguracije u mat crnoj služe kao uzorci za ponovljene narudžbe, individualne dizajne i podbrendove.",
    "Primjer osobnog paketa: 6 reketa za igru, 4 ili 5 Spot Trainer i 4 ili 5 Sweet Spot Trainer, svi iste odabrane duljine. To prikazuje individualni odabir, a ne standardnu količinu za svakog igrača.",
    "Prilagođene serije od 100–200 komada primjeri su za raspravu, a ne opća minimalna narudžba. Dizajn, specifikacije i uvjeti serije dogovaraju se zasebno.",
    "MAXIMUS Pro Shop arhitektonski je koncept za konceptualni teniski klub: automatizirano skladištenje na pliticama, odabir, izdavanje i povrat. Tehnička izvedivost, kapacitet i certifikacija još nisu potvrđeni."
  ],
  sr: [
    "Zamišljena je trajna referentna zbirka za individualni izbor, odvojena od prodajnih zaliha. Stabilne osnovne konfiguracije u mat crnoj služe kao uzorci za ponovljene porudžbine, individualne dizajne i podbrendove.",
    "Primer ličnog paketa: 6 reketa za igru, 4 ili 5 Spot Trainer i 4 ili 5 Sweet Spot Trainer, svi iste izabrane dužine. To prikazuje individualni izbor, a ne standardnu količinu za svakog igrača.",
    "Prilagođene serije od 100–200 komada primeri su za razgovor, a ne opšta minimalna porudžbina. Dizajn, specifikacije i uslovi serije dogovaraju se zasebno.",
    "MAXIMUS Pro Shop je arhitektonski koncept za konceptualni teniski klub: automatizovano skladištenje na tacnama, izbor, izdavanje i povrat. Tehnička izvodljivost, kapacitet i sertifikacija još nisu potvrđeni."
  ],
  ro: [
    "Se propune o bibliotecă permanentă de referință și probă, separată de stocul pentru vânzare. Configurațiile de bază stabile, în negru mat, servesc drept referință pentru comenzi repetate, designuri personalizate și submărci.",
    "Exemplu de pachet personal: 6 rachete de joc, 4 sau 5 Spot Trainer și 4 sau 5 Sweet Spot Trainer, toate cu aceeași lungime aleasă. Este o ilustrare a selecției individuale, nu o cantitate standard pentru fiecare jucător.",
    "Loturile personalizate de 100–200 de unități sunt exemple pentru discuție, nu o comandă minimă universală. Designul, specificațiile și condițiile lotului se stabilesc separat.",
    "MAXIMUS Pro Shop este un concept arhitectural pentru un club conceptual de tenis: depozitare automatizată pe tăvi, selecție, eliberare și returnare. Fezabilitatea tehnică, capacitatea și certificarea nu sunt încă stabilite."
  ],
  bg: [
    "Замисълът е постоянна еталонна библиотека за индивидуален подбор, отделена от стоките за продажба. Стабилните базови конфигурации в матово черно служат за образци при повторни поръчки, индивидуални дизайни и подмарки.",
    "Пример за личен комплект: 6 игрови ракети, 4 или 5 Spot Trainer и 4 или 5 Sweet Spot Trainer — всички с еднаква избрана дължина. Това илюстрира индивидуален подбор, а не стандартно количество за всеки играч.",
    "Индивидуалните партиди от 100–200 броя са примери за обсъждане, а не универсална минимална поръчка. Дизайнът, спецификациите и условията на партидата се договарят отделно.",
    "MAXIMUS Pro Shop е архитектурна концепция за концептуален тенис клуб: автоматизирано съхранение върху тави, избор, издаване и връщане. Техническата осъществимост, вместимостта и сертификацията още не са потвърдени."
  ],
  el: [
    "Προβλέπεται μια μόνιμη βιβλιοθήκη αναφοράς και δοκιμής, χωριστή από το απόθεμα πωλήσεων. Σταθερές βασικές διαμορφώσεις σε μαύρο ματ χρησιμεύουν ως αναφορά για επαναληπτικές παραγγελίες, εξατομικευμένα σχέδια και υπομάρκες.",
    "Παράδειγμα προσωπικού πακέτου: 6 ρακέτες παιχνιδιού, 4 ή 5 Spot Trainer και 4 ή 5 Sweet Spot Trainer, όλα στο ίδιο επιλεγμένο μήκος. Αποτελεί παράδειγμα ατομικής επιλογής, όχι τυπική ποσότητα για κάθε παίκτη.",
    "Εξατομικευμένες παρτίδες 100–200 τεμαχίων είναι παραδείγματα για συζήτηση, όχι καθολική ελάχιστη παραγγελία. Το σχέδιο, οι προδιαγραφές και οι όροι της παρτίδας συμφωνούνται χωριστά.",
    "Το MAXIMUS Pro Shop είναι αρχιτεκτονική ιδέα για έναν εννοιολογικό όμιλο τένις: αυτοματοποιημένη αποθήκευση σε δίσκους, επιλογή, παραλαβή και επιστροφή. Η τεχνική εφικτότητα, η χωρητικότητα και η πιστοποίηση δεν έχουν ακόμη επιβεβαιωθεί."
  ],
  sv: [
    "Avsikten är ett permanent referens- och utprovningsbibliotek, skilt från försäljningslagret. Stabila mattsvarta grundkonfigurationer fungerar som referenser för återbeställningar, egna designer och undermärken.",
    "Exempel på personligt paket: 6 spelracketar, 4 eller 5 Spot Trainer och 4 eller 5 Sweet Spot Trainer, alla i samma valda längd. Det illustrerar ett individuellt urval, inte en standardmängd för varje spelare.",
    "Specialanpassade partier om 100–200 enheter är diskussionsexempel, inte en allmän minsta beställning. Design, specifikationer och partivillkor avtalas separat.",
    "MAXIMUS Pro Shop är ett arkitekturkoncept för en konceptklubb för tennis: automatiserad förvaring i brickor, urval, utlämning och återlämning. Teknisk genomförbarhet, kapacitet och certifiering är ännu inte fastställda."
  ],
  no: [
    "Planen er et permanent referanse- og tilpasningsbibliotek, atskilt fra salgslageret. Stabile, matt svarte grunnkonfigurasjoner fungerer som referanser for gjentatte bestillinger, egne design og undermerker.",
    "Eksempel på personlig pakke: 6 spillracketer, 4 eller 5 Spot Trainer og 4 eller 5 Sweet Spot Trainer, alle med samme valgte lengde. Dette viser et individuelt utvalg, ikke en standardmengde for hver spiller.",
    "Tilpassede partier på 100–200 enheter er eksempler til diskusjon, ikke en generell minsteordre. Design, spesifikasjoner og partivilkår avtales separat.",
    "MAXIMUS Pro Shop er et arkitekturkonsept for en konseptklubb for tennis: automatisert oppbevaring i brett, valg, utlevering og retur. Teknisk gjennomførbarhet, kapasitet og sertifisering er ennå ikke etablert."
  ],
  tr: [
    "Amaç, satış stokundan ayrı kalıcı bir referans ve kişiye uygun seçim arşividir. Sabit mat siyah temel yapılandırmalar; tekrar siparişler, özel tasarımlar ve alt markalar için referans oluşturur.",
    "Kişisel paket örneği: aynı seçilen uzunlukta 6 oyun raketi, 4 veya 5 Spot Trainer ve 4 veya 5 Sweet Spot Trainer. Bu, bireysel seçime bir örnektir; her oyuncu için standart adet değildir.",
    "100–200 adetlik özel partiler, görüşme örnekleridir; evrensel bir asgari sipariş miktarı değildir. Tasarım, özellikler ve parti koşulları ayrıca kararlaştırılır.",
    "MAXIMUS Pro Shop, bir tenis konsept kulübü için mimari bir kavramdır: otomatik tepsili depolama, seçim, teslim alma ve iade. Mühendislik uygulanabilirliği, kapasite ve sertifikasyon henüz doğrulanmamıştır."
  ],
  az: [
    "Məqsəd satış ehtiyatından ayrı daimi nümunə və fərdi seçim kitabxanasıdır. Sabit tutqun qara baza konfiqurasiyaları təkrar sifarişlər, fərdi dizaynlar və alt brendlər üçün nümunə rolunu oynayır.",
    "Şəxsi paket nümunəsi: eyni seçilmiş uzunluqda 6 oyun raketi, 4 və ya 5 Spot Trainer və 4 və ya 5 Sweet Spot Trainer. Bu, fərdi seçimin nümunəsidir, hər oyunçu üçün standart say deyil.",
    "100–200 ədədlik fərdi partiyalar müzakirə nümunələridir, ümumi minimum sifariş deyil. Dizayn, xüsusiyyətlər və partiya şərtləri ayrıca razılaşdırılır.",
    "MAXIMUS Pro Shop tennis konsept klubu üçün memarlıq konsepsiyasıdır: avtomatlaşdırılmış nimçə saxlancı, seçim, götürmə və geri qaytarma. Mühəndislik mümkünlüyü, tutum və sertifikatlaşdırma hələ təsdiqlənməyib."
  ],
  uz: [
    "Maqsad — sotuv zaxirasidan alohida doimiy namuna va individual tanlash kutubxonasi. O‘zgarmas asosiy xira qora konfiguratsiyalar takroriy buyurtmalar, individual dizaynlar va subbrendlar uchun namuna bo‘ladi.",
    "Shaxsiy paket namunasi: bir xil tanlangan uzunlikda 6 ta o‘yin raketkasi, 4 yoki 5 ta Spot Trainer va 4 yoki 5 ta Sweet Spot Trainer. Bu individual tanlov namunasi, har bir o‘yinchi uchun standart miqdor emas.",
    "100–200 donalik individual partiyalar muhokama uchun misollardir, umumiy minimal buyurtma emas. Dizayn, xususiyatlar va partiya shartlari alohida kelishiladi.",
    "MAXIMUS Pro Shop — tennis konsept klubi uchun arxitektura konsepsiyasi: avtomatlashtirilgan patnisli saqlash, tanlash, berish va qaytarish. Muhandislik imkoniyati, sig‘im va sertifikatlash hali tasdiqlanmagan."
  ],
  kk: [
    "Мақсат — сатуға арналған қордан бөлек тұрақты эталондық және жеке таңдау кітапханасы. Күңгірт қара түсті тұрақты базалық конфигурациялар қайталама тапсырыстарға, жеке дизайндарға және суббрендтерге үлгі болады.",
    "Жеке жинақ мысалы: бірдей таңдалған ұзындықтағы 6 ойын ракеткасы, 4 немесе 5 Spot Trainer және 4 немесе 5 Sweet Spot Trainer. Бұл — жеке таңдаудың мысалы, әр ойыншыға арналған стандартты сан емес.",
    "100–200 даналық жеке партиялар — талқылауға арналған мысалдар, жалпыға ортақ ең аз тапсырыс емес. Дизайн, сипаттамалар және партия шарттары бөлек келісіледі.",
    "MAXIMUS Pro Shop — теннис концепт-клубына арналған сәулеттік тұжырымдама: науаларда автоматтандырылған сақтау, таңдау, беру және қайтару. Инженерлік орындалуы, сыйымдылығы және сертификаттауы әлі расталмаған."
  ],
  ar: [
    "المقترح مكتبة مرجعية دائمة للتجربة والاختيار الفردي، منفصلة عن مخزون البيع. تكون التهيئات الأساسية الثابتة باللون الأسود المطفأ مراجع لإعادة الطلب والتصاميم المخصصة والعلامات الفرعية.",
    "مثال لحزمة شخصية: 6 مضارب للعب، و4 أو 5 من Spot Trainer، و4 أو 5 من Sweet Spot Trainer، كلها بالطول المختار نفسه. هذا مثال للاختيار الفردي وليس عددًا قياسيًا لكل لاعب.",
    "الدفعات المخصصة من 100–200 وحدة أمثلة للمناقشة، وليست حدًا أدنى عامًا للطلب. يُتفق على التصميم والمواصفات وشروط الدفعة بصورة منفصلة.",
    "MAXIMUS Pro Shop تصور معماري لنادٍ مفاهيمي للتنس: تخزين آلي على صوانٍ واختيار واستلام وإرجاع. لم تُثبت بعد الجدوى الهندسية أو السعة أو الاعتمادات."
  ],
  hi: [
    "उद्देश्य बिक्री स्टॉक से अलग एक स्थायी संदर्भ और व्यक्तिगत चयन पुस्तकालय है। स्थिर मैट-काले आधार कॉन्फ़िगरेशन दोबारा ऑर्डर, विशेष डिज़ाइन और उप-ब्रांडों के लिए संदर्भ बनते हैं।",
    "व्यक्तिगत पैकेज का उदाहरण: 6 खेल रैकेट, 4 या 5 Spot Trainer और 4 या 5 Sweet Spot Trainer, सभी एक ही चुनी हुई लंबाई के। यह व्यक्तिगत चयन का उदाहरण है, हर खिलाड़ी के लिए मानक संख्या नहीं।",
    "100–200 इकाइयों के विशेष बैच चर्चा के उदाहरण हैं, सार्वभौमिक न्यूनतम ऑर्डर नहीं। डिज़ाइन, विनिर्देश और बैच की शर्तों पर अलग सहमति आवश्यक है।",
    "MAXIMUS Pro Shop एक टेनिस कॉन्सेप्ट क्लब की वास्तु अवधारणा है: स्वचालित ट्रे भंडारण, चयन, प्राप्ति और वापसी। इंजीनियरिंग व्यवहार्यता, क्षमता और प्रमाणन अभी स्थापित नहीं हैं।"
  ],
  id: [
    "Direncanakan sebagai pustaka referensi dan pencocokan permanen, terpisah dari stok penjualan. Konfigurasi dasar hitam dof yang tetap menjadi referensi untuk pemesanan ulang, desain khusus, dan submerek.",
    "Contoh paket pribadi: 6 raket bermain, 4 atau 5 Spot Trainer, dan 4 atau 5 Sweet Spot Trainer, semuanya dengan panjang pilihan yang sama. Ini menggambarkan pilihan individual, bukan jumlah standar untuk setiap pemain.",
    "Batch khusus 100–200 unit merupakan contoh untuk pembahasan, bukan minimum pesanan universal. Desain, spesifikasi, dan ketentuan batch disepakati secara terpisah.",
    "MAXIMUS Pro Shop adalah konsep arsitektur untuk klub konsep tenis: penyimpanan baki otomatis, pemilihan, pengambilan, dan pengembalian. Kelayakan teknis, kapasitas, dan sertifikasi belum ditetapkan."
  ],
  fil: [
    "Layunin ang permanenteng aklatan ng sanggunian at pansariling pagpili, hiwalay sa imbentaryong ibinebenta. Ang matatag na batayang pagsasaayos sa matte na itim ay sanggunian para sa muling pag-order, pasadyang disenyo at mga sub-brand.",
    "Halimbawa ng personal na pakete: 6 na raket para sa laro, 4 o 5 Spot Trainer at 4 o 5 Sweet Spot Trainer, lahat sa iisang napiling haba. Halimbawa ito ng pansariling pagpili, hindi karaniwang bilang para sa bawat manlalaro.",
    "Ang pasadyang batch na 100–200 piraso ay halimbawa para sa talakayan, hindi pangkalahatang minimum na order. Hiwalay na pinagkakasunduan ang disenyo, espesipikasyon at mga kondisyon ng batch.",
    "Ang MAXIMUS Pro Shop ay konseptong arkitektural para sa isang tennis concept club: awtomatikong imbakan sa mga tray, pagpili, pagkuha at pagbabalik. Hindi pa natitiyak ang teknikal na pagiging posible, kapasidad at sertipikasyon."
  ],
  th: [
    "แนวคิดคือคลังตัวอย่างถาวรสำหรับอ้างอิงและเลือกให้เหมาะกับแต่ละคน แยกจากสต็อกเพื่อขาย สเปกพื้นฐานสีดำด้านที่คงที่ใช้เป็นตัวอ้างอิงสำหรับการสั่งซ้ำ งานออกแบบเฉพาะ และแบรนด์ย่อย",
    "ตัวอย่างชุดส่วนตัว: ไม้เล่น 6 อัน, Spot Trainer 4 หรือ 5 อัน และ Sweet Spot Trainer 4 หรือ 5 อัน ทั้งหมดใช้ความยาวที่เลือกเท่ากัน เป็นตัวอย่างการเลือกเฉพาะบุคคล ไม่ใช่จำนวนมาตรฐานสำหรับผู้เล่นทุกคน",
    "ชุดสั่งทำ 100–200 ชิ้นเป็นตัวอย่างเพื่อหารือ ไม่ใช่จำนวนสั่งซื้อขั้นต่ำที่ใช้กับทุกกรณี ต้องตกลงงานออกแบบ สเปก และเงื่อนไขของแต่ละชุดแยกต่างหาก",
    "MAXIMUS Pro Shop เป็นแนวคิดทางสถาปัตยกรรมสำหรับเทนนิสคอนเซปต์คลับ: จัดเก็บด้วยถาดอัตโนมัติ เลือก เบิก และคืน ยังไม่ได้ยืนยันความเป็นไปได้ทางวิศวกรรม ความจุ หรือการรับรอง"
  ],
  ja: [
    "販売在庫とは別に、比較・試打と個別フィッティングのための常設ライブラリーを構想しています。仕様を維持したマットブラックの基本構成を、再注文、独自デザイン、サブブランドの基準とします。",
    "個人用パッケージの例：競技用ラケット6本、Spot Trainer 4本または5本、Sweet Spot Trainer 4本または5本を、すべて同じ選択した長さで揃えます。個別選択の一例であり、全プレーヤー共通の標準本数ではありません。",
    "100–200本の特注ロットは協議用の例であり、一律の最低発注数量ではありません。デザイン、仕様、ロット条件は別途合意します。",
    "MAXIMUS Pro Shopはテニス・コンセプトクラブ向けの建築構想です。トレーによる自動保管、選択、取り出し、返却を想定しています。技術的実現性、容量、認証はまだ確立されていません。"
  ],
  ko: [
    "판매 재고와 별도로 상설 비교 및 개인별 피팅 라이브러리를 구상합니다. 안정적으로 유지하는 무광 검정 기본 구성을 재주문, 맞춤 디자인 및 하위 브랜드의 기준으로 삼습니다.",
    "개인 패키지 예시: 경기용 라켓 6개, Spot Trainer 4개 또는 5개, Sweet Spot Trainer 4개 또는 5개를 모두 같은 선택 길이로 구성합니다. 개인별 선택의 예시이며 모든 선수에게 적용되는 표준 수량은 아닙니다.",
    "100–200개 맞춤 제작 물량은 협의를 위한 예시이며 보편적인 최소 주문량이 아닙니다. 디자인, 사양 및 제작 물량 조건은 별도로 합의합니다.",
    "MAXIMUS Pro Shop은 테니스 콘셉트 클럽을 위한 건축 구상으로, 트레이 자동 보관, 선택, 출고 및 반납을 포함합니다. 공학적 실현 가능성, 수용량 및 인증은 아직 확정되지 않았습니다."
  ],
  zh: [
    "计划建立独立于销售库存的永久参考与试配样品库。稳定的哑光黑色基础配置将作为重复订购、定制设计及子品牌的参考。",
    "个人套装示例：6支比赛球拍、4或5支Spot Trainer、4或5支Sweet Spot Trainer，全部采用同一选定长度。这只是个性化选择示例，并非适用于每位球员的标准数量。",
    "100–200支的定制批次只是供讨论的示例，不是统一的最低起订量。设计、规格和批次条件须另行商定。",
    "MAXIMUS Pro Shop是面向网球概念俱乐部的建筑构想：采用自动托盘储存、选择、取出和归还。工程可行性、容量及认证尚未确定。"
  ],
  cs: [
    "Záměrem je stálá referenční knihovna pro individuální výběr, oddělená od prodejních zásob. Stabilní základní konfigurace v matné černé slouží jako vzory pro opakované objednávky, vlastní designy a podznačky.",
    "Příklad osobního balíčku: 6 herních raket, 4 nebo 5 Spot Trainer a 4 nebo 5 Sweet Spot Trainer, všechny se stejnou zvolenou délkou. Jde o ukázku individuálního výběru, nikoli standardní počet pro každého hráče.",
    "Zakázkové série po 100–200 kusech jsou příklady k diskusi, nikoli obecná minimální objednávka. Design, specifikace a podmínky série se sjednávají samostatně.",
    "MAXIMUS Pro Shop je architektonický koncept koncepčního tenisového klubu: automatizované ukládání do zásobníků, výběr, výdej a vrácení. Technická proveditelnost, kapacita a certifikace zatím nejsou potvrzeny."
  ],
  sl: [
    "Zamišljena je stalna referenčna zbirka za individualno izbiro, ločena od prodajnih zalog. Stabilne osnovne konfiguracije v mat črni barvi so vzorci za ponovna naročila, lastne zasnove in podznamke.",
    "Primer osebnega paketa: 6 igralnih loparjev, 4 ali 5 Spot Trainer in 4 ali 5 Sweet Spot Trainer, vsi enake izbrane dolžine. To prikazuje individualno izbiro, ne standardne količine za vsakega igralca.",
    "Prilagojene serije s 100–200 kosi so primeri za razpravo, ne splošno najmanjše naročilo. Zasnova, specifikacije in pogoji serije se dogovorijo ločeno.",
    "MAXIMUS Pro Shop je arhitekturni koncept za konceptualni teniški klub: avtomatizirano shranjevanje na pladnjih, izbira, izdaja in vračilo. Tehnična izvedljivost, zmogljivost in certificiranje še niso potrjeni."
  ],
  bs: [
    "Zamišljena je trajna referentna zbirka za individualni izbor, odvojena od prodajnih zaliha. Stabilne osnovne konfiguracije u mat crnoj služe kao uzorci za ponovljene narudžbe, individualne dizajne i podbrendove.",
    "Primjer ličnog paketa: 6 reketa za igru, 4 ili 5 Spot Trainer i 4 ili 5 Sweet Spot Trainer, svi iste izabrane dužine. To prikazuje individualni izbor, a ne standardnu količinu za svakog igrača.",
    "Prilagođene serije od 100–200 komada primjeri su za razgovor, a ne opća minimalna narudžba. Dizajn, specifikacije i uslovi serije dogovaraju se zasebno.",
    "MAXIMUS Pro Shop je arhitektonski koncept za konceptualni teniski klub: automatizirano skladištenje na tacnama, izbor, izdavanje i povrat. Tehnička izvodljivost, kapacitet i certifikacija još nisu potvrđeni."
  ],
  mk: [
    "Замислата е постојана референтна библиотека за индивидуален избор, одвоена од продажните залихи. Стабилните основни конфигурации во мат црна боја служат како примери за повторни нарачки, индивидуални дизајни и подбрендови.",
    "Пример за личен пакет: 6 рекети за игра, 4 или 5 Spot Trainer и 4 или 5 Sweet Spot Trainer, сите со иста избрана должина. Ова илустрира индивидуален избор, а не стандардна количина за секој играч.",
    "Прилагодените серии од 100–200 парчиња се примери за разговор, а не општа минимална нарачка. Дизајнот, спецификациите и условите на серијата се договараат одделно.",
    "MAXIMUS Pro Shop е архитектонски концепт за концептуален тениски клуб: автоматизирано складирање на послужавници, избор, издавање и враќање. Техничката изводливост, капацитетот и сертификацијата сè уште не се потврдени."
  ],
  sq: [
    "Synohet një bibliotekë e përhershme referimi dhe përshtatjeje, e ndarë nga stoku i shitjes. Konfigurimet bazë të qëndrueshme në të zezë mat shërbejnë si referenca për porosi të përsëritura, dizajne të personalizuara dhe nënmarka.",
    "Shembull pakete personale: 6 raketa loje, 4 ose 5 Spot Trainer dhe 4 ose 5 Sweet Spot Trainer, të gjitha me të njëjtën gjatësi të zgjedhur. Ky është shembull i përzgjedhjes individuale, jo sasi standarde për çdo lojtar.",
    "Seritë e personalizuara me 100–200 njësi janë shembuj për diskutim, jo një porosi minimale universale. Dizajni, specifikimet dhe kushtet e serisë bien dakord veçmas.",
    "MAXIMUS Pro Shop është një koncept arkitekturor për një klub konceptual tenisi: ruajtje e automatizuar në tabaka, përzgjedhje, marrje dhe kthim. Fizibiliteti teknik, kapaciteti dhe certifikimi ende nuk janë përcaktuar."
  ],
  da: [
    "Tanken er et permanent reference- og tilpasningsbibliotek, adskilt fra salgslageret. Stabile matsorte grundkonfigurationer fungerer som reference for genbestillinger, egne design og undermærker.",
    "Eksempel på en personlig pakke: 6 spilleketsjere, 4 eller 5 Spot Trainer og 4 eller 5 Sweet Spot Trainer, alle i samme valgte længde. Det illustrerer et individuelt udvalg, ikke en standardmængde for hver spiller.",
    "Specialtilpassede partier på 100–200 enheder er eksempler til drøftelse, ikke en generel minimumsordre. Design, specifikationer og partivilkår aftales særskilt.",
    "MAXIMUS Pro Shop er et arkitekturkoncept til en konceptklub for tennis: automatiseret opbevaring i bakker, valg, udlevering og returnering. Teknisk gennemførlighed, kapacitet og certificering er endnu ikke fastlagt."
  ],
  fi: [
    "Tavoitteena on pysyvä vertailu- ja sovituskirjasto erillään myyntivarastosta. Vakaat mattamustat peruskokoonpanot toimivat vertailukohtina uusintatilauksille, yksilöllisille malleille ja alabrändeille.",
    "Esimerkki henkilökohtaisesta paketista: 6 pelimailaa, 4 tai 5 Spot Traineria ja 4 tai 5 Sweet Spot Traineria, kaikki saman valitun pituisina. Tämä havainnollistaa yksilöllistä valintaa, ei jokaisen pelaajan vakiomäärää.",
    "100–200 kappaleen yksilölliset erät ovat keskusteluesimerkkejä, eivät yleinen vähimmäistilaus. Muotoilu, määrittelyt ja erän ehdot sovitaan erikseen.",
    "MAXIMUS Pro Shop on tenniksen konseptiklubin arkkitehtoninen suunnitelma: automaattinen tarjotinsäilytys, valinta, nouto ja palautus. Teknistä toteutettavuutta, kapasiteettia ja sertifiointia ei ole vielä vahvistettu."
  ],
  is: [
    "Hugmyndin er varanlegt viðmiðunar- og mátunarsafn, aðskilið frá sölubirgðum. Stöðugar grunnútfærslur í möttum svörtum lit eru viðmið fyrir endurteknar pantanir, sérhönnun og undirvörumerki.",
    "Dæmi um persónulegan pakka: 6 leikspaðar, 4 eða 5 Spot Trainer og 4 eða 5 Sweet Spot Trainer, allir í sömu völdu lengd. Þetta sýnir einstaklingsval, ekki staðlaðan fjölda fyrir alla leikmenn.",
    "Sérsmíðaðar lotur með 100–200 einingum eru dæmi til umræðu, ekki almennt lágmarkspöntunarmagn. Samið er sérstaklega um hönnun, forskriftir og lotuskilmála.",
    "MAXIMUS Pro Shop er byggingarlistarhugmynd fyrir hugmyndaklúbb í tennis: sjálfvirk geymsla á bökkum, val, afhending og skil. Tæknileg framkvæmanleiki, rýmd og vottun hafa ekki enn verið staðfest."
  ],
  ga: [
    "Tá leabharlann bhuan tagartha agus feistithe beartaithe, ar leith ón stoc díolacháin. Is tagairtí iad cumraíochtaí bunúsacha seasmhacha dubha neamhlonracha le haghaidh athorduithe, dearaí saincheaptha agus fobhrandaí.",
    "Sampla de phacáiste pearsanta: 6 raicéad imeartha, 4 nó 5 Spot Trainer agus 4 nó 5 Sweet Spot Trainer, iad uile ar an bhfad roghnaithe céanna. Léiríonn sé rogha aonair, ní cainníocht chaighdeánach do gach imreoir.",
    "Is samplaí le plé iad baisceanna saincheaptha de 100–200 aonad, ní íosordú uilíoch. Comhaontaítear an dearadh, na sonraíochtaí agus coinníollacha na baisce ar leithligh.",
    "Is coincheap ailtireachta do chlub coincheapa leadóige é MAXIMUS Pro Shop: stóráil uathoibrithe ar thráidirí, roghnú, eisiúint agus filleadh. Níl indéantacht innealtóireachta, toilleadh ná deimhniú bunaithe fós."
  ],
  et: [
    "Kavandatud on püsiv võrdlus- ja sobitusraamatukogu, mis on müügivarust eraldi. Püsivad mattmustad baaskonfiguratsioonid on kordustellimuste, erikujunduste ja alambrändide võrdlusaluseks.",
    "Isikliku paketi näide: 6 mängureketit, 4 või 5 Spot Trainerit ja 4 või 5 Sweet Spot Trainerit, kõik sama valitud pikkusega. See on individuaalse valiku näide, mitte iga mängija standardkogus.",
    "100–200 ühikuga eritellimuspartiid on arutelunäited, mitte üldine minimaalne tellimus. Kujundus, tehnilised andmed ja partii tingimused lepitakse kokku eraldi.",
    "MAXIMUS Pro Shop on tennisekontseptsiooniklubi arhitektuurne idee: automaatne kandikutel hoidmine, valimine, väljastamine ja tagastus. Tehniline teostatavus, mahutavus ja sertifitseerimine pole veel kindlaks tehtud."
  ],
  lv: [
    "Iecere ir pastāvīga atsauces un piemeklēšanas bibliotēka, atsevišķi no pārdošanas krājumiem. Stabilas matēti melnas pamata konfigurācijas kalpo par atsauci atkārtotiem pasūtījumiem, individuāliem dizainiem un apakšzīmoliem.",
    "Personīga komplekta piemērs: 6 spēles raketes, 4 vai 5 Spot Trainer un 4 vai 5 Sweet Spot Trainer, visi vienādā izvēlētā garumā. Tas ilustrē individuālu izvēli, nevis standarta daudzumu katram spēlētājam.",
    "Individuālas 100–200 vienību partijas ir piemēri apspriešanai, nevis vispārējs minimālais pasūtījums. Dizainu, specifikācijas un partijas nosacījumus saskaņo atsevišķi.",
    "MAXIMUS Pro Shop ir arhitektūras koncepcija tenisa konceptklubam: automatizēta glabāšana uz paplātēm, izvēle, izsniegšana un atgriešana. Inženiertehniskā īstenojamība, ietilpība un sertifikācija vēl nav apstiprināta."
  ],
  lt: [
    "Numatoma nuolatinė pavyzdžių ir individualaus parinkimo biblioteka, atskirta nuo pardavimo atsargų. Pastovios matinės juodos bazinės konfigūracijos yra pakartotinių užsakymų, individualių dizainų ir antrinių prekių ženklų atskaitos taškas.",
    "Asmeninio rinkinio pavyzdys: 6 žaidimo raketės, 4 arba 5 Spot Trainer ir 4 arba 5 Sweet Spot Trainer, visi vienodo pasirinkto ilgio. Tai individualaus pasirinkimo pavyzdys, o ne standartinis kiekis kiekvienam žaidėjui.",
    "Individualios 100–200 vienetų partijos yra aptarimo pavyzdžiai, o ne visuotinis mažiausias užsakymas. Dizainas, specifikacijos ir partijos sąlygos derinami atskirai.",
    "MAXIMUS Pro Shop yra architektūrinė koncepcinio teniso klubo idėja: automatizuotas laikymas padėkluose, pasirinkimas, išdavimas ir grąžinimas. Inžinerinis įgyvendinamumas, talpa ir sertifikavimas dar nepatvirtinti."
  ],
  mt: [
    "L-għan huwa librerija permanenti ta’ referenza u għażla individwali, separata mill-istokk għall-bejgħ. Konfigurazzjonijiet bażi stabbli bl-iswed matt iservu ta’ referenza għal ordnijiet ripetuti, disinji apposta u sottoditti.",
    "Eżempju ta’ pakkett personali: 6 rakketti tal-logħob, 4 jew 5 Spot Trainer u 4 jew 5 Sweet Spot Trainer, kollha bl-istess tul magħżul. Dan juri għażla individwali, mhux kwantità standard għal kull plejer.",
    "Lottijiet apposta ta’ 100–200 unità huma eżempji għad-diskussjoni, mhux ordni minima universali. Id-disinn, l-ispeċifikazzjonijiet u l-kundizzjonijiet tal-lott jiġu miftiehma separatament.",
    "MAXIMUS Pro Shop huwa kunċett arkitettoniku għal klabb kunċettwali tat-tennis: ħażna awtomatizzata fuq trejs, għażla, ħruġ u ritorn. Il-fattibbiltà tal-inġinerija, il-kapaċità u ċ-ċertifikazzjoni għadhom mhumiex stabbiliti."
  ],
  ca: [
    "Es proposa una biblioteca permanent de referència i ajust, separada de l’estoc de venda. Les configuracions base estables en negre mat serveixen de referència per a comandes repetides, dissenys personalitzats i submarques.",
    "Exemple de paquet personal: 6 raquetes de joc, 4 o 5 Spot Trainer i 4 o 5 Sweet Spot Trainer, tots amb la mateixa llargada escollida. Il·lustra una selecció individual, no una quantitat estàndard per a cada jugador.",
    "Els lots personalitzats de 100–200 unitats són exemples per debatre, no una comanda mínima universal. El disseny, les especificacions i les condicions del lot s’acorden per separat.",
    "MAXIMUS Pro Shop és un concepte arquitectònic per a un club conceptual de tennis: emmagatzematge automatitzat en safates, selecció, lliurament i retorn. La viabilitat tècnica, la capacitat i la certificació encara no estan establertes."
  ],
  eu: [
    "Salmentako stocketik bereizitako erreferentzia- eta egokitzapen-liburutegi iraunkorra da asmoa. Oinarrizko konfigurazio beltz mate egonkorrak errepikatutako eskaeren, diseinu pertsonalizatuen eta azpimarken erreferentzia dira.",
    "Pakete pertsonalaren adibidea: jokorako 6 erraketa, 4 edo 5 Spot Trainer eta 4 edo 5 Sweet Spot Trainer, guztiak hautatutako luzera berekoak. Banakako aukeraketaren adibidea da, ez jokalari guztientzako kopuru estandarra.",
    "100–200 aleko lote pertsonalizatuak eztabaidarako adibideak dira, ez gutxieneko eskaera unibertsala. Diseinua, zehaztapenak eta lotearen baldintzak bereiz adosten dira.",
    "MAXIMUS Pro Shop teniseko kontzeptu-klub baterako arkitektura-ideia da: erretiluen bidezko biltegiratze automatizatua, aukeraketa, jasotzea eta itzultzea. Ingeniaritza-bideragarritasuna, edukiera eta ziurtapena ez daude oraindik egiaztatuta."
  ],
  gl: [
    "Proponse unha biblioteca permanente de referencia e axuste, separada das existencias para venda. As configuracións base estables en negro mate serven de referencia para pedidos repetidos, deseños personalizados e submarcas.",
    "Exemplo de paquete persoal: 6 raquetas de xogo, 4 ou 5 Spot Trainer e 4 ou 5 Sweet Spot Trainer, todos coa mesma lonxitude escollida. Ilustra unha selección individual, non unha cantidade estándar para cada xogador.",
    "Os lotes personalizados de 100–200 unidades son exemplos para debater, non un pedido mínimo universal. O deseño, as especificacións e as condicións do lote acórdanse por separado.",
    "MAXIMUS Pro Shop é un concepto arquitectónico para un club conceptual de tenis: almacenamento automatizado en bandexas, selección, entrega e devolución. A viabilidade técnica, a capacidade e a certificación aínda non están establecidas."
  ]
};

export function nationalPackageCopy(locale) {
  const row = rows[locale];
  if (!row || row.length !== 7 || row.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(`Missing National Package translation: ${locale}`);
  }
  const lifecycle = lifecycleRows[locale];
  if (!lifecycle || lifecycle.length !== 4 || lifecycle.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(`Missing National Package lifecycle translation: ${locale}`);
  }
  const [title, lead, inclusion, scope, boundary, historical, variants] = row;
  const [referenceLifecycle, personalExample, customBatches, proShop] = lifecycle;
  return { title, lead, inclusion, scope, boundary, historical, variants, referenceLifecycle, personalExample, customBatches, proShop };
}
