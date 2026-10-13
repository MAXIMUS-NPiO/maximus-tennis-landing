/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Catalogue extension, owner instructions 12–13 October 2026. All 48 existing languages. */
import { trainerWeights, sweetSpotTrainer, standardLengths } from "../data/products.js";
import { nationalPackageCopy } from "./national-package-copy.js";
const copy = {
  "en": {
    "standard": "Standard lengths",
    "short": "Short",
    "custom": "Custom-made length",
    "note": "Choose one of seven standard request lengths. Custom-made lengths require technical review; competition eligibility is checked separately.",
    "balanceNote": "Historical weight and balance data do not confirm the balance at a new length."
  },
  "ru": {
    "standard": "Стандартные длины",
    "short": "Укороченная",
    "custom": "Индивидуальная длина",
    "note": "Выберите одну из семи стандартных длин для заявки. Индивидуальная длина требует технической проверки; допуск к соревнованиям проверяется отдельно.",
    "balanceNote": "Прежние данные веса и баланса не подтверждают баланс при новой длине."
  },
  "uk": {
    "standard": "Стандартні довжини",
    "short": "Укорочена",
    "custom": "Індивідуальна довжина",
    "note": "Виберіть одну із семи стандартних довжин для заявки. Індивідуальна довжина потребує технічної перевірки; допуск до змагань перевіряється окремо.",
    "balanceNote": "Попередні дані ваги та балансу не підтверджують баланс за нової довжини."
  },
  "be": {
    "standard": "Стандартныя даўжыні",
    "short": "Скарочаная",
    "custom": "Індывідуальная даўжыня",
    "note": "Выберыце адну з сямі стандартных даўжынь для заяўкі. Індывідуальная даўжыня патрабуе тэхнічнай праверкі; допуск да спаборніцтваў правяраецца асобна.",
    "balanceNote": "Папярэднія даныя вагі і балансу не пацвярджаюць баланс пры новай даўжыні."
  },
  "de": {
    "standard": "Standardlängen",
    "short": "Verkürzt",
    "custom": "Individuelle Länge",
    "note": "Wählen Sie eine von sieben Standardlängen für Ihre Anfrage. Individuelle Längen erfordern eine technische Prüfung; die Wettkampfzulässigkeit wird separat geprüft.",
    "balanceNote": "Bisherige Gewichts- und Balancedaten bestätigen die Balance bei einer neuen Länge nicht."
  },
  "nl": {
    "standard": "Standaardlengtes",
    "short": "Verkort",
    "custom": "Lengte op maat",
    "note": "Kies een van zeven standaardlengtes voor uw aanvraag. Maatwerklengtes vereisen technische beoordeling; toelating tot wedstrijden wordt apart beoordeeld.",
    "balanceNote": "Bestaande gewichts- en balansgegevens bevestigen de balans bij een nieuwe lengte niet."
  },
  "fr": {
    "standard": "Longueurs standard",
    "short": "Raccourcie",
    "custom": "Longueur sur mesure",
    "note": "Choisissez parmi sept longueurs standard pour votre demande. Une longueur sur mesure nécessite une étude technique ; l’admissibilité en compétition est vérifiée séparément.",
    "balanceNote": "Les données antérieures de poids et d’équilibre ne confirment pas l’équilibre pour une nouvelle longueur."
  },
  "es": {
    "standard": "Longitudes estándar",
    "short": "Acortada",
    "custom": "Longitud a medida",
    "note": "Elija una de las siete longitudes estándar para su solicitud. Las longitudes a medida requieren revisión técnica; la admisión en competición se verifica por separado.",
    "balanceNote": "Los datos anteriores de peso y balance no confirman el balance con una nueva longitud."
  },
  "it": {
    "standard": "Lunghezze standard",
    "short": "Accorciata",
    "custom": "Lunghezza su misura",
    "note": "Scegli una delle sette lunghezze standard per la richiesta. Le lunghezze su misura richiedono una verifica tecnica; l’ammissibilità alle competizioni è verificata separatamente.",
    "balanceNote": "I dati precedenti di peso e bilanciamento non confermano il bilanciamento con una nuova lunghezza."
  },
  "pt": {
    "standard": "Comprimentos padrão",
    "short": "Encurtada",
    "custom": "Comprimento por medida",
    "note": "Escolha um dos sete comprimentos padrão para o pedido. Os comprimentos por medida exigem análise técnica; a admissibilidade em competição é verificada separadamente.",
    "balanceNote": "Os dados anteriores de peso e equilíbrio não confirmam o equilíbrio com um novo comprimento."
  },
  "pl": {
    "standard": "Długości standardowe",
    "short": "Skrócona",
    "custom": "Długość indywidualna",
    "note": "Wybierz jedną z siedmiu standardowych długości do zapytania. Długość indywidualna wymaga oceny technicznej; dopuszczenie do zawodów jest sprawdzane oddzielnie.",
    "balanceNote": "Dotychczasowe dane masy i balansu nie potwierdzają balansu przy nowej długości."
  },
  "hu": {
    "standard": "Szabványos hosszúságok",
    "short": "Rövidített",
    "custom": "Egyedi hosszúság",
    "note": "Válasszon a hét szabványos igényelhető hosszúság közül. Az egyedi hosszúság műszaki vizsgálatot igényel; a versenyeken való használhatóságot külön ellenőrizzük.",
    "balanceNote": "A korábbi tömeg- és egyensúlyadatok nem igazolják az új hosszúsághoz tartozó egyensúlyt."
  },
  "sk": {
    "standard": "Štandardné dĺžky",
    "short": "Skrátená",
    "custom": "Individuálna dĺžka",
    "note": "Vyberte si jednu zo siedmich štandardných dĺžok do žiadosti. Individuálna dĺžka vyžaduje technické posúdenie; prípustnosť na súťažiach sa overuje samostatne.",
    "balanceNote": "Pôvodné údaje o hmotnosti a vyvážení nepotvrdzujú vyváženie pri novej dĺžke."
  },
  "hr": {
    "standard": "Standardne duljine",
    "short": "Skraćena",
    "custom": "Duljina po mjeri",
    "note": "Odaberite jednu od sedam standardnih duljina za upit. Duljina po mjeri zahtijeva tehničku provjeru; dopuštenost na natjecanjima provjerava se zasebno.",
    "balanceNote": "Dosadašnji podaci o težini i ravnoteži ne potvrđuju ravnotežu pri novoj duljini."
  },
  "sr": {
    "standard": "Standardne dužine",
    "short": "Skraćena",
    "custom": "Dužina po meri",
    "note": "Izaberite jednu od sedam standardnih dužina za upit. Dužina po meri zahteva tehničku proveru; dozvoljenost na takmičenjima proverava se posebno.",
    "balanceNote": "Prethodni podaci o težini i balansu ne potvrđuju balans pri novoj dužini."
  },
  "ro": {
    "standard": "Lungimi standard",
    "short": "Scurtată",
    "custom": "Lungime personalizată",
    "note": "Alegeți una dintre cele șapte lungimi standard pentru solicitare. Lungimile personalizate necesită evaluare tehnică; eligibilitatea pentru competiții se verifică separat.",
    "balanceNote": "Datele anterioare despre greutate și echilibru nu confirmă echilibrul la o lungime nouă."
  },
  "bg": {
    "standard": "Стандартни дължини",
    "short": "Скъсена",
    "custom": "Индивидуална дължина",
    "note": "Изберете една от седемте стандартни дължини за запитването. Индивидуалната дължина изисква техническа проверка; допускането до състезания се проверява отделно.",
    "balanceNote": "Предишните данни за тегло и баланс не потвърждават баланса при нова дължина."
  },
  "el": {
    "standard": "Τυπικά μήκη",
    "short": "Κοντύτερη",
    "custom": "Εξατομικευμένο μήκος",
    "note": "Επιλέξτε ένα από τα επτά τυπικά μήκη για το αίτημα. Τα εξατομικευμένα μήκη απαιτούν τεχνικό έλεγχο· η καταλληλότητα για αγώνες ελέγχεται ξεχωριστά.",
    "balanceNote": "Τα προηγούμενα δεδομένα βάρους και ισορροπίας δεν επιβεβαιώνουν την ισορροπία σε νέο μήκος."
  },
  "sv": {
    "standard": "Standardlängder",
    "short": "Förkortad",
    "custom": "Specialanpassad längd",
    "note": "Välj en av sju standardlängder för förfrågan. Specialanpassade längder kräver teknisk granskning; tävlingsbehörighet kontrolleras separat.",
    "balanceNote": "Tidigare vikt- och balansdata bekräftar inte balansen vid en ny längd."
  },
  "no": {
    "standard": "Standardlengder",
    "short": "Forkortet",
    "custom": "Tilpasset lengde",
    "note": "Velg en av sju standardlengder for forespørselen. Tilpassede lengder krever teknisk vurdering; tillatelse i konkurranser vurderes separat.",
    "balanceNote": "Tidligere vekt- og balansedata bekrefter ikke balansen ved en ny lengde."
  },
  "tr": {
    "standard": "Standart uzunluklar",
    "short": "Kısaltılmış",
    "custom": "Özel uzunluk",
    "note": "Talebiniz için yedi standart uzunluktan birini seçin. Özel uzunluklar teknik inceleme gerektirir; müsabakalara uygunluk ayrıca kontrol edilir.",
    "balanceNote": "Önceki ağırlık ve denge verileri yeni bir uzunluktaki dengeyi doğrulamaz."
  },
  "az": {
    "standard": "Standart uzunluqlar",
    "short": "Qısaldılmış",
    "custom": "Fərdi uzunluq",
    "note": "Sorğu üçün yeddi standart uzunluqdan birini seçin. Fərdi uzunluq texniki yoxlama tələb edir; yarışlara uyğunluq ayrıca yoxlanılır.",
    "balanceNote": "Əvvəlki çəki və balans məlumatları yeni uzunluqdakı balansı təsdiqləmir."
  },
  "uz": {
    "standard": "Standart uzunliklar",
    "short": "Qisqartirilgan",
    "custom": "Individual uzunlik",
    "note": "So‘rov uchun yettita standart uzunlikdan birini tanlang. Individual uzunlik texnik tekshiruvni talab qiladi; musobaqalarda foydalanish mumkinligi alohida tekshiriladi.",
    "balanceNote": "Oldingi vazn va balans ma’lumotlari yangi uzunlikdagi balansni tasdiqlamaydi."
  },
  "kk": {
    "standard": "Стандартты ұзындықтар",
    "short": "Қысқартылған",
    "custom": "Жеке ұзындық",
    "note": "Өтінім үшін жеті стандартты ұзындықтың бірін таңдаңыз. Жеке ұзындық техникалық тексеруді қажет етеді; жарысқа жарамдылығы бөлек тексеріледі.",
    "balanceNote": "Бұрынғы салмақ пен баланс деректері жаңа ұзындықтағы балансты растамайды."
  },
  "ar": {
    "standard": "الأطوال القياسية",
    "short": "قصيرة",
    "custom": "طول حسب الطلب",
    "note": "اختر أحد الأطوال القياسية السبعة لطلبك. يتطلب الطول حسب الطلب مراجعة فنية؛ وتُفحص أهلية الاستخدام في المنافسات بصورة منفصلة.",
    "balanceNote": "لا تؤكد بيانات الوزن والتوازن السابقة التوازن عند طول جديد."
  },
  "hi": {
    "standard": "मानक लंबाइयाँ",
    "short": "छोटी",
    "custom": "विशेष अनुरोध की लंबाई",
    "note": "अनुरोध के लिए सात मानक लंबाइयों में से एक चुनें। विशेष लंबाई की तकनीकी समीक्षा आवश्यक है; प्रतियोगिता में पात्रता की अलग से जाँच होती है।",
    "balanceNote": "पुराने वजन और संतुलन के आँकड़े नई लंबाई पर संतुलन की पुष्टि नहीं करते।"
  },
  "id": {
    "standard": "Panjang standar",
    "short": "Diperpendek",
    "custom": "Panjang khusus",
    "note": "Pilih satu dari tujuh panjang standar untuk permintaan Anda. Panjang khusus memerlukan tinjauan teknis; kelayakan untuk kompetisi diperiksa terpisah.",
    "balanceNote": "Data berat dan keseimbangan sebelumnya tidak memastikan keseimbangan pada panjang baru."
  },
  "fil": {
    "standard": "Mga karaniwang haba",
    "short": "Pinaikli",
    "custom": "Pasadyang haba",
    "note": "Pumili ng isa sa pitong karaniwang haba para sa kahilingan. Kailangang suriin nang teknikal ang pasadyang haba; hiwalay ang pagsusuri para sa paggamit sa paligsahan.",
    "balanceNote": "Hindi pinatutunayan ng dating datos ng timbang at balanse ang balanse sa bagong haba."
  },
  "th": {
    "standard": "ความยาวมาตรฐาน",
    "short": "แบบสั้น",
    "custom": "ความยาวสั่งทำ",
    "note": "เลือกหนึ่งในเจ็ดความยาวมาตรฐานสำหรับคำขอ ความยาวสั่งทำต้องผ่านการตรวจสอบทางเทคนิค และตรวจสอบสิทธิ์ใช้ในการแข่งขันแยกต่างหาก",
    "balanceNote": "ข้อมูลน้ำหนักและสมดุลเดิมไม่ได้ยืนยันสมดุลที่ความยาวใหม่"
  },
  "ja": {
    "standard": "標準の長さ",
    "short": "ショート",
    "custom": "特注の長さ",
    "note": "ご依頼には7種類の標準の長さからお選びください。特注の長さは技術審査が必要です。競技での使用可否は別途確認します。",
    "balanceNote": "従来の重量・バランスデータは、新しい長さでのバランスを保証するものではありません。"
  },
  "ko": {
    "standard": "표준 길이",
    "short": "단축형",
    "custom": "맞춤 길이",
    "note": "요청할 일곱 가지 표준 길이 중 하나를 선택하세요. 맞춤 길이는 기술 검토가 필요하며 대회 사용 가능 여부는 별도로 확인합니다.",
    "balanceNote": "기존 무게와 밸런스 데이터는 새로운 길이에서의 밸런스를 확인해 주지 않습니다."
  },
  "zh": {
    "standard": "标准长度",
    "short": "短款",
    "custom": "定制长度",
    "note": "请从七种标准长度中选择申请规格。定制长度需经技术审核；能否用于比赛须另行核实。",
    "balanceNote": "原有重量和平衡数据不能确认新长度下的平衡值。"
  },
  "cs": {
    "standard": "Standardní délky",
    "short": "Zkrácená",
    "custom": "Individuální délka",
    "note": "Vyberte jednu ze sedmi standardních délek pro poptávku. Individuální délka vyžaduje technické posouzení; přípustnost pro soutěže se ověřuje samostatně.",
    "balanceNote": "Dosavadní údaje o hmotnosti a vyvážení nepotvrzují vyvážení při nové délce."
  },
  "sl": {
    "standard": "Standardne dolžine",
    "short": "Skrajšana",
    "custom": "Dolžina po meri",
    "note": "Za povpraševanje izberite eno od sedmih standardnih dolžin. Dolžina po meri zahteva tehnični pregled; dopustnost na tekmovanjih se preveri ločeno.",
    "balanceNote": "Prejšnji podatki o teži in ravnotežju ne potrjujejo ravnotežja pri novi dolžini."
  },
  "bs": {
    "standard": "Standardne dužine",
    "short": "Skraćena",
    "custom": "Dužina po mjeri",
    "note": "Odaberite jednu od sedam standardnih dužina za upit. Dužina po mjeri zahtijeva tehničku provjeru; dopuštenost na takmičenjima provjerava se zasebno.",
    "balanceNote": "Prethodni podaci o težini i ravnoteži ne potvrđuju ravnotežu pri novoj dužini."
  },
  "mk": {
    "standard": "Стандардни должини",
    "short": "Скратена",
    "custom": "Индивидуална должина",
    "note": "Изберете една од седумте стандардни должини за барањето. Индивидуалната должина бара техничка проверка; дозволеноста на натпревари се проверува одделно.",
    "balanceNote": "Претходните податоци за тежина и баланс не го потврдуваат балансот при нова должина."
  },
  "sq": {
    "standard": "Gjatësitë standarde",
    "short": "E shkurtuar",
    "custom": "Gjatësi me porosi",
    "note": "Zgjidhni një nga shtatë gjatësitë standarde për kërkesën. Gjatësia me porosi kërkon shqyrtim teknik; lejimi në gara kontrollohet veçmas.",
    "balanceNote": "Të dhënat e mëparshme të peshës dhe ekuilibrit nuk konfirmojnë ekuilibrin në një gjatësi të re."
  },
  "da": {
    "standard": "Standardlængder",
    "short": "Forkortet",
    "custom": "Specialtilpasset længde",
    "note": "Vælg en af syv standardlængder til forespørgslen. Specialtilpassede længder kræver teknisk vurdering; tilladelse til konkurrencebrug kontrolleres særskilt.",
    "balanceNote": "Tidligere vægt- og balancedata bekræfter ikke balancen ved en ny længde."
  },
  "fi": {
    "standard": "Vakiopituudet",
    "short": "Lyhennetty",
    "custom": "Yksilöllinen pituus",
    "note": "Valitse pyyntöön yksi seitsemästä vakiopituudesta. Yksilöllinen pituus vaatii teknisen arvioinnin; kilpailukelpoisuus tarkistetaan erikseen.",
    "balanceNote": "Aiemmat paino- ja tasapainotiedot eivät vahvista tasapainoa uudella pituudella."
  },
  "is": {
    "standard": "Staðlaðar lengdir",
    "short": "Stytt",
    "custom": "Sérsmíðuð lengd",
    "note": "Veldu eina af sjö stöðluðum lengdum fyrir fyrirspurnina. Sérsmíðaðar lengdir krefjast tæknilegrar yfirferðar; heimild til keppnisnotkunar er skoðuð sérstaklega.",
    "balanceNote": "Fyrri þyngdar- og jafnvægisgögn staðfesta ekki jafnvægi við nýja lengd."
  },
  "ga": {
    "standard": "Faid chaighdeánacha",
    "short": "Giorraithe",
    "custom": "Fad saincheaptha",
    "note": "Roghnaigh ceann de na seacht bhfad chaighdeánacha don iarratas. Teastaíonn athbhreithniú teicniúil ar fhaid shaincheaptha; déantar incháilitheacht don iomaíocht a sheiceáil ar leithligh.",
    "balanceNote": "Ní dheimhníonn na sonraí meáchain agus cothromaíochta roimhe seo an chothromaíocht ag fad nua."
  },
  "et": {
    "standard": "Standardpikkused",
    "short": "Lühendatud",
    "custom": "Eritellimuse pikkus",
    "note": "Valige päringusse üks seitsmest standardpikkusest. Eritellimuse pikkus vajab tehnilist hindamist; võistlustel kasutamise lubatavust kontrollitakse eraldi.",
    "balanceNote": "Varasemad kaalu- ja tasakaaluandmed ei kinnita tasakaalu uue pikkuse korral."
  },
  "lv": {
    "standard": "Standarta garumi",
    "short": "Saīsināta",
    "custom": "Individuāls garums",
    "note": "Pieprasījumam izvēlieties vienu no septiņiem standarta garumiem. Individuālam garumam nepieciešama tehniskā pārbaude; atļauja izmantot sacensībās tiek pārbaudīta atsevišķi.",
    "balanceNote": "Iepriekšējie svara un līdzsvara dati neapstiprina līdzsvaru jaunā garumā."
  },
  "lt": {
    "standard": "Standartiniai ilgiai",
    "short": "Sutrumpinta",
    "custom": "Individualus ilgis",
    "note": "Užklausai pasirinkite vieną iš septynių standartinių ilgių. Individualiam ilgiui būtina techninė patikra; tinkamumas varžyboms tikrinamas atskirai.",
    "balanceNote": "Ankstesni svorio ir balanso duomenys nepatvirtina balanso esant naujam ilgiui."
  },
  "mt": {
    "standard": "Tulijiet standard",
    "short": "Imqassra",
    "custom": "Tul magħmul apposta",
    "note": "Agħżel wieħed minn seba’ tulijiet standard għat-talba. Tul magħmul apposta jeħtieġ reviżjoni teknika; l-eliġibbiltà għall-kompetizzjoni tiġi vverifikata separatament.",
    "balanceNote": "Id-data preċedenti dwar il-piż u l-bilanċ ma tikkonfermax il-bilanċ b’tul ġdid."
  },
  "ca": {
    "standard": "Longituds estàndard",
    "short": "Escurçada",
    "custom": "Longitud a mida",
    "note": "Trieu una de les set longituds estàndard per a la sol·licitud. Les longituds a mida requereixen revisió tècnica; l’admissibilitat en competició es comprova per separat.",
    "balanceNote": "Les dades anteriors de pes i balanç no confirmen el balanç amb una nova longitud."
  },
  "eu": {
    "standard": "Luzera estandarrak",
    "short": "Laburtua",
    "custom": "Neurrira egindako luzera",
    "note": "Aukeratu zazpi luzera estandarretako bat eskaerarako. Neurrira egindako luzerek azterketa teknikoa behar dute; lehiaketetan erabiltzeko baimena bereiz egiaztatzen da.",
    "balanceNote": "Aurreko pisu- eta oreka-datuek ez dute luzera berriko oreka baieztatzen."
  },
  "gl": {
    "standard": "Lonxitudes estándar",
    "short": "Acurtada",
    "custom": "Lonxitude á medida",
    "note": "Escolla unha das sete lonxitudes estándar para a solicitude. As lonxitudes á medida requiren revisión técnica; a admisibilidade en competición compróbase por separado.",
    "balanceNote": "Os datos anteriores de peso e equilibrio non confirman o equilibrio cunha nova lonxitude."
  }
};
export function applyCatalogueUpdate(locale, d) {
  const c = copy[locale];
  if (!c) throw new Error(`Missing catalogue translation: ${locale}`);
  const L = d.common.labels;
  const national = nationalPackageCopy(locale);
  d.nationalPackage = national;
  d.catalogue = { ...c, length: d.sst.columns.length, plus: "Plus", superlong: "Superlong" };
  d.build.fieldNames.lengthMode = c.standard;
  d.build.fieldNames.lengthIn = `${d.sst.columns.length} (${L.inches})`;
  d.build.fieldNames.customLengthIn = `${c.custom} (${L.inches})`;
  d.build.fieldNames.productKind = d.form.fields.seriesInterest;
  d.build.fieldNames.catalogueVersion = d.gps.dataVersion;
  // Keep numerical truth in data/products.js; wording reuses this locale's approved terminology.
  const weights = `${trainerWeights[0]}–${trainerWeights.at(-1)} ${L.grams} · ${trainerWeights[1] - trainerWeights[0]} ${L.grams} · ${trainerWeights.length} ${L.points}`;
  const lengths = `${d.sst.columns.length}: ${standardLengths.map((x) => x.inches).join(" · ")} ${L.inches}`;
  d.sst.lead = `${d.sst.purpose.join(" · ")}. ${weights}. ${lengths}.`;
  d.sst.systemTitle = `${L.weight} · ${trainerWeights.length} ${L.points}`;
  d.sst.baseline = national.historical;
  d.sst.systemLead = `${national.historical}: ${sweetSpotTrainer.lengthIn} ${L.inches}. ${d.sst.systemLead} ${c.balanceNote}`;
  d.spot.lead = `${d.spot.purposeP} ${weights}. ${lengths}.`;
  d.spot.weightsP = `${weights}. ${d.spot.dims}`;
  d.training.sst.p = `${d.sst.purpose[0]}. ${sweetSpotTrainer.headSizeSqIn} ${L.sqin} · ${weights}. ${lengths}.`;
  d.training.spot.p = `${d.spot.purposeP} ${weights}. ${lengths}.`;
  d.home.training.sstP = d.training.sst.p;
  d.home.training.sstCaption = `${national.historical} · 300 ${L.grams} · ${sweetSpotTrainer.lengthIn} ${L.inches}`;
  // Replace obsolete claims that length is unpublished, retaining the other unknown parameters.
  const missing = [d.precision.extended.stringPattern, d.precision.extended.beamProfile, L.swingweight, L.stiffness].join(" · ");
  d.seriesPage.notPublished = `${d.build.status.notPublished}: ${missing}. ${d.custom.lead}`;
  d.racquets.compareLead = `${c.note} ${d.seriesPage.notPublished}`;
  return d;
}
