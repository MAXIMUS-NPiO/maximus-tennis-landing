/*! © 2026 Maximus Kiriyakulov. All rights reserved. Proprietary: no licence is granted. */
/** Draft transaction labels; existing 48-language catalogue and panel are preserved.
 * Legal terms / invoice translations require separate approval before release.
 */
const rows = {
 en:['Order account','Payment','Payments disabled','Paid invoice','Retry email','Purchase','Financing unavailable'],
 ru:['Кабинет заказа','Оплата','Платежи отключены','Оплаченный инвойс','Повторить письмо','Покупка','Финансирование недоступно'],
 zh:['订单账户','付款','付款已禁用','已付款发票','重试邮件','购买','融资不可用'],
 de:['Bestellkonto','Zahlung','Zahlungen deaktiviert','Bezahlte Rechnung','E-Mail erneut senden','Kauf','Finanzierung nicht verfügbar'],
 nl:['Bestelaccount','Betaling','Betalingen uitgeschakeld','Betaalde factuur','E-mail opnieuw proberen','Aankoop','Financiering niet beschikbaar'],
 da:['Ordrekonto','Betaling','Betalinger deaktiveret','Betalt faktura','Prøv e-mail igen','Køb','Finansiering utilgængelig'],
 no:['Ordrekonto','Betaling','Betalinger deaktivert','Betalt faktura','Prøv e-post igjen','Kjøp','Finansiering utilgjengelig'],
 sv:['Orderkonto','Betalning','Betalningar inaktiverade','Betald faktura','Försök med e-post igen','Köp','Finansiering ej tillgänglig'],
 fi:['Tilaustili','Maksu','Maksut poistettu käytöstä','Maksettu lasku','Yritä sähköpostia uudelleen','Osto','Rahoitus ei saatavilla'],
 is:['Pöntunarreikningur','Greiðsla','Greiðslur óvirkar','Greiddur reikningur','Reyna tölvupóst aftur','Kaup','Fjármögnun ekki í boði'],
 ga:['Cuntas ordaithe','Íocaíocht','Íocaíochtaí díchumasaithe','Sonrasc íoctha','Bain triail as ríomhphost arís','Ceannach','Maoiniú nach bhfuil ar fáil'],
 fr:['Compte de commande','Paiement','Paiements désactivés','Facture acquittée','Réessayer le courriel','Achat','Financement indisponible'],
 ca:['Compte de comanda','Pagament','Pagaments desactivats','Factura pagada','Reintenta el correu','Compra','Finançament no disponible'],
 eu:['Eskaera kontua','Ordainketa','Ordainketak desgaituta','Ordaindutako faktura','Saiatu berriro mezuarekin','Erosketa','Finantzaketa ez dago erabilgarri'],
 gl:['Conta do pedido','Pagamento','Pagamentos desactivados','Factura pagada','Reintentar correo','Compra','Financiamento non dispoñible'],
 es:['Cuenta del pedido','Pago','Pagos desactivados','Factura pagada','Reintentar correo','Compra','Financiación no disponible'],
 pt:['Conta do pedido','Pagamento','Pagamentos desativados','Fatura paga','Tentar e-mail novamente','Compra','Financiamento indisponível'],
 it:['Account ordine','Pagamento','Pagamenti disattivati','Fattura pagata','Riprova email','Acquisto','Finanziamento non disponibile'],
 mt:['Kont tal-ordni','Ħlas','Ħlasijiet diżattivati','Fattura mħallsa','Erġa’ pprova l-email','Xiri','Finanzjament mhux disponibbli'],
 pl:['Konto zamówienia','Płatność','Płatności wyłączone','Opłacona faktura','Ponów e-mail','Zakup','Finansowanie niedostępne'],
 cs:['Účet objednávky','Platba','Platby vypnuty','Zaplacená faktura','Zkusit e-mail znovu','Nákup','Financování není dostupné'],
 sk:['Účet objednávky','Platba','Platby vypnuté','Zaplatená faktúra','Skúsiť e-mail znova','Nákup','Financovanie nedostupné'],
 hu:['Rendelési fiók','Fizetés','Fizetések letiltva','Kifizetett számla','E-mail újrapróbálása','Vásárlás','Finanszírozás nem elérhető'],
 sl:['Račun naročila','Plačilo','Plačila onemogočena','Plačan račun','Ponovi e-pošto','Nakup','Financiranje ni na voljo'],
 hr:['Račun narudžbe','Plaćanje','Plaćanja onemogućena','Plaćeni račun','Ponovi e-poštu','Kupnja','Financiranje nije dostupno'],
 bs:['Račun narudžbe','Plaćanje','Plaćanja onemogućena','Plaćena faktura','Ponovi e-poštu','Kupovina','Finansiranje nije dostupno'],
 sr:['Nalog porudžbine','Plaćanje','Plaćanja onemogućena','Plaćena faktura','Ponovi e-poštu','Kupovina','Finansiranje nije dostupno'],
 mk:['Сметка за нарачка','Плаќање','Плаќањата се оневозможени','Платена фактура','Повтори е-пошта','Купување','Финансирање недостапно'],
 sq:['Llogaria e porosisë','Pagesa','Pagesat të çaktivizuara','Faturë e paguar','Riprovo emailin','Blerje','Financimi i padisponueshëm'],
 ro:['Contul comenzii','Plată','Plăți dezactivate','Factură plătită','Reîncearcă e-mailul','Cumpărare','Finanțare indisponibilă'],
 bg:['Акаунт на поръчката','Плащане','Плащанията са изключени','Платена фактура','Повтори имейла','Покупка','Финансиране недостъпно'],
 el:['Λογαριασμός παραγγελίας','Πληρωμή','Πληρωμές απενεργοποιημένες','Εξοφλημένο τιμολόγιο','Επανάληψη email','Αγορά','Χρηματοδότηση μη διαθέσιμη'],
 et:['Tellimuse konto','Makse','Maksed keelatud','Tasutud arve','Proovi e-kirja uuesti','Ost','Rahastus pole saadaval'],
 lv:['Pasūtījuma konts','Maksājums','Maksājumi atspējoti','Apmaksāts rēķins','Atkārtot e-pastu','Pirkums','Finansējums nav pieejams'],
 lt:['Užsakymo paskyra','Mokėjimas','Mokėjimai išjungti','Apmokėta sąskaita','Kartoti el. laišką','Pirkimas','Finansavimas neprieinamas'],
 uk:['Кабінет замовлення','Оплата','Платежі вимкнено','Оплачений інвойс','Повторити лист','Купівля','Фінансування недоступне'],
 be:['Кабінет замовы','Аплата','Плацяжы адключаны','Аплачаны інвойс','Паўтарыць ліст','Купля','Фінансаванне недаступнае'],
 tr:['Sipariş hesabı','Ödeme','Ödemeler devre dışı','Ödenmiş fatura','E-postayı tekrar dene','Satın alma','Finansman kullanılamıyor'],
 az:['Sifariş hesabı','Ödəniş','Ödənişlər deaktivdir','Ödənilmiş faktura','E-poçtu yenidən göndər','Alış','Maliyyələşdirmə əlçatan deyil'],
 uz:['Buyurtma hisobi','To‘lov','To‘lovlar o‘chirilgan','To‘langan hisob-faktura','Xatni qayta yuborish','Xarid','Moliyalashtirish mavjud emas'],
 kk:['Тапсырыс кабинеті','Төлем','Төлемдер өшірілген','Төленген шот','Хатты қайталау','Сатып алу','Қаржыландыру қолжетімсіз'],
 ar:['حساب الطلب','الدفع','المدفوعات معطلة','فاتورة مدفوعة','إعادة محاولة البريد','شراء','التمويل غير متاح'],
 hi:['ऑर्डर खाता','भुगतान','भुगतान बंद हैं','भुगतान किया गया इनवॉइस','ईमेल फिर भेजें','खरीद','वित्तपोषण अनुपलब्ध'],
 id:['Akun pesanan','Pembayaran','Pembayaran dinonaktifkan','Faktur lunas','Coba email lagi','Pembelian','Pembiayaan tidak tersedia'],
 fil:['Account ng order','Pagbabayad','Hindi pinagana ang pagbabayad','Bayad na invoice','Subukan muli ang email','Pagbili','Hindi magagamit ang pagpopondo'],
 th:['บัญชีคำสั่งซื้อ','การชำระเงิน','ปิดการชำระเงิน','ใบแจ้งหนี้ที่ชำระแล้ว','ลองส่งอีเมลอีกครั้ง','การซื้อ','ไม่สามารถจัดหาเงินทุนได้'],
 ja:['注文アカウント','支払い','支払いは無効です','支払済み請求書','メールを再送','購入','資金提供は利用できません'],
 ko:['주문 계정','결제','결제가 비활성화됨','결제 완료 청구서','이메일 재시도','구매','자금 조달 불가'],
};
export const commerceLabels = Object.fromEntries(Object.entries(rows).map(([l, r]) => [l, Object.fromEntries(['account','payment','disabled','invoice','retry','purchase','financingBlocked'].map((k, i) => [k, r[i]]))]));

// Payment preference labels: choice only; no live link or banking instruction is generated.
const transactionLabels = {
 en:['Bank wire','Payment link on request','Confirm my choice'], ru:['Банковский перевод','Платёжная ссылка по запросу','Подтверждаю свой выбор'], zh:['银行转账','按要求提供付款链接','确认我的选择'],
 de:['Banküberweisung','Zahlungslink auf Anfrage','Meine Auswahl bestätigen'],nl:['Bankoverschrijving','Betaallink op verzoek','Mijn keuze bevestigen'],da:['Bankoverførsel','Betalingslink på anmodning','Bekræft mit valg'],no:['Bankoverføring','Betalingslenke på forespørsel','Bekreft mitt valg'],sv:['Banköverföring','Betalningslänk på begäran','Bekräfta mitt val'],fi:['Pankkisiirto','Maksulinkki pyynnöstä','Vahvista valintani'],is:['Bankamillifærsla','Greiðslutengill eftir beiðni','Staðfesta val mitt'],ga:['Aistriú bainc','Nasc íocaíochta ar iarratas','Deimhnigh mo rogha'],fr:['Virement bancaire','Lien de paiement sur demande','Confirmer mon choix'],ca:['Transferència bancària','Enllaç de pagament a petició','Confirmar la meva elecció'],eu:['Banku transferentzia','Ordainketa esteka eskatuta','Nire aukera berretsi'],gl:['Transferencia bancaria','Ligazón de pagamento por solicitude','Confirmar a miña elección'],es:['Transferencia bancaria','Enlace de pago bajo petición','Confirmar mi elección'],pt:['Transferência bancária','Link de pagamento mediante pedido','Confirmar minha escolha'],it:['Bonifico bancario','Link di pagamento su richiesta','Confermare la mia scelta'],mt:['Trasferiment bankarju','Link tal-ħlas fuq talba','Ikkonferma l-għażla tiegħi'],pl:['Przelew bankowy','Link do płatności na życzenie','Potwierdź mój wybór'],cs:['Bankovní převod','Platební odkaz na vyžádání','Potvrdit mou volbu'],sk:['Bankový prevod','Platobný odkaz na požiadanie','Potvrdiť moju voľbu'],hu:['Banki átutalás','Fizetési link kérésre','Választásom megerősítése'],sl:['Bančno nakazilo','Plačilna povezava na zahtevo','Potrdi mojo izbiro'],hr:['Bankovni prijenos','Poveznica za plaćanje na zahtjev','Potvrdi moj izbor'],bs:['Bankovni prijenos','Link za plaćanje na zahtjev','Potvrdi moj izbor'],sr:['Bankovni prenos','Link za plaćanje na zahtev','Potvrdi moj izbor'],mk:['Банкарски трансфер','Линк за плаќање на барање','Потврди го мојот избор'],sq:['Transfertë bankare','Lidhje pagese sipas kërkesës','Konfirmo zgjedhjen time'],ro:['Transfer bancar','Link de plată la cerere','Confirmă alegerea mea'],bg:['Банков превод','Платежна връзка при поискване','Потвърждавам избора си'],el:['Τραπεζική μεταφορά','Σύνδεσμος πληρωμής κατόπιν αιτήματος','Επιβεβαίωση της επιλογής μου'],et:['Pangaülekanne','Makselink soovi korral','Kinnita minu valik'],lv:['Bankas pārskaitījums','Maksājuma saite pēc pieprasījuma','Apstiprināt manu izvēli'],lt:['Banko pavedimas','Mokėjimo nuoroda paprašius','Patvirtinti mano pasirinkimą'],uk:['Банківський переказ','Платіжне посилання за запитом','Підтверджую свій вибір'],be:['Банкаўскі перавод','Плацежная спасылка па запыце','Пацвярджаю свой выбар'],tr:['Banka havalesi','Talep üzerine ödeme bağlantısı','Seçimimi onayla'],az:['Bank köçürməsi','Sorğu üzrə ödəniş keçidi','Seçimimi təsdiqləyirəm'],uz:['Bank o‘tkazmasi','So‘rov bo‘yicha to‘lov havolasi','Tanlovimni tasdiqlayman'],kk:['Банк аударымы','Сұрау бойынша төлем сілтемесі','Таңдауымды растаймын'],ar:['تحويل بنكي','رابط دفع عند الطلب','تأكيد اختياري'],hi:['बैंक ट्रांसफर','अनुरोध पर भुगतान लिंक','मेरी पसंद की पुष्टि करें'],id:['Transfer bank','Tautan pembayaran atas permintaan','Konfirmasi pilihan saya'],fil:['Bank transfer','Payment link kapag hiniling','Kumpirmahin ang aking pinili'],th:['โอนเงินผ่านธนาคาร','ลิงก์ชำระเงินตามคำขอ','ยืนยันตัวเลือกของฉัน'],ja:['銀行振込','リクエストに応じた決済リンク','選択を確認する'],ko:['은행 송금','요청 시 결제 링크','내 선택 확인'],
};
for (const [locale, labels] of Object.entries(transactionLabels)) Object.assign(commerceLabels[locale], { bankWire: labels[0], paymentLink: labels[1], confirmChoice: labels[2] });
