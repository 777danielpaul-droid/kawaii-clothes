/* Rechtstexte: Impressum, Datenschutz, Versand & Rückgabe, Kontakt.
   Die Texte stehen hier; die Angaben zum Betreiber (Name, Anschrift, E-Mail …) trägt man im CMS unter „Rechtliches“ ein.
   Fehlende Angaben erscheinen gelb markiert als [… ergänzen], bis sie ausgefüllt sind.
   WICHTIG: Das sind Mustertexte ohne Rechtsberatung. Vor dem echten Verkauf von einer Anwältin/einem Anwalt oder einem
   Rechtstexte-Dienst (z. B. IT-Recht Kanzlei, Händlerbund, eRecht24) prüfen lassen. Stand der Texte: Oktober 2026. */

export type LegalPage = 'impressum' | 'datenschutz' | 'versand' | 'kontakt';
export type LegalData = Record<string, string>;

/** Felder im CMS (Reihenfolge = Anzeige). required: ohne diese Angabe sind die Texte unvollständig. */
export const LEGAL_FIELDS: { key: string; label: string; hint: string; required: boolean }[] = [
  { key: 'name',          label: 'Name / Firma',                    hint: 'Vor- und Nachname bzw. Firma mit Rechtsform', required: true },
  { key: 'street',        label: 'Straße und Hausnummer',           hint: 'ladungsfähige Anschrift, kein Postfach',      required: true },
  { key: 'zipCity',       label: 'PLZ und Ort',                     hint: 'z. B. 21423 Winsen',                          required: true },
  { key: 'email',         label: 'E-Mail',                          hint: 'für Kunden erreichbar',                       required: true },
  { key: 'phone',         label: 'Telefon',                         hint: 'Pflicht in der Widerrufsbelehrung',           required: true },
  { key: 'vatId',         label: 'USt-IdNr. (falls vorhanden)',     hint: 'leer lassen, z. B. bei Kleinunternehmern',    required: false },
  { key: 'vatNote',       label: 'Hinweis zur Umsatzsteuer',        hint: 'z. B. „inkl. gesetzlicher Umsatzsteuer“ oder Kleinunternehmerhinweis nach § 19 UStG', required: true },
  { key: 'shipCountries', label: 'Versandländer',                   hint: 'z. B. Deutschland, Österreich',               required: true },
  { key: 'shippingCosts', label: 'Versandkosten',                   hint: 'z. B. „4,90 € innerhalb Deutschlands, ab 60 € versandkostenfrei“', required: true },
  { key: 'deliveryTime',  label: 'Lieferzeit',                      hint: 'z. B. „3–5 Werktage“',                         required: true },
  { key: 'hosting',       label: 'Hosting-Anbieter',                hint: 'Name und Sitz des Anbieters, auf dem die Seite läuft', required: true },
  { key: 'payment',       label: 'Zahlungsdienstleister',           hint: 'wie im Shopify-Checkout eingestellt, z. B. Shopify Payments, PayPal', required: true },
  { key: 'authority',     label: 'Datenschutz-Aufsichtsbehörde',    hint: 'zuständige Landesbehörde Ihres Bundeslandes',  required: true },
  { key: 'withdrawalUrl', label: 'Adresse der Widerrufsfunktion',   hint: 'seit 19.06.2026 Pflicht (§ 356a BGB): Internetadresse des „Vertrag widerrufen“-Buttons', required: true },
];

/** Fest eingetragene Betreiberangaben (gelten, solange im CMS nichts anderes steht). */
export const LEGAL_DEFAULTS: LegalData = {
  name: 'Daniel Paul',
  street: 'Imhoffstücken 18',
  zipCity: '21423 Winsen',
  phone: '0151 67575229',
  authority: 'Der Landesbeauftragte für den Datenschutz Niedersachsen, Prinzenstraße 5, 30159 Hannover',   // zuständig für Niedersachsen (Winsen/Luhe)
};

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const label = (key: string) => LEGAL_FIELDS.find(f => f.key === key)?.label ?? key;

/** Anzahl der Pflichtangaben, die noch fehlen (für den Hinweis im CMS). */
export const missingLegal = (d: LegalData) => { const m = { ...LEGAL_DEFAULTS, ...d }; return LEGAL_FIELDS.filter(f => f.required && !m[f.key]?.trim()).length; };

function make(d: LegalData) {
  /** Wert des Feldes, sonst gelb markierter Platzhalter. */
  const v = (key: string) => (d[key]?.trim() ? esc(d[key].trim()) : `<mark class="todo">[${esc(label(key))} ergänzen]</mark>`);
  const address = `${v('name')}<br>${v('street')}<br>${v('zipCity')}`;
  const mail = d.email?.trim() ? `<a href="mailto:${esc(d.email.trim())}">${esc(d.email.trim())}</a>` : v('email');
  const phone = d.phone?.trim() ? `<a href="tel:${esc(d.phone.trim().replace(/[^+\d]/g, ''))}">${esc(d.phone.trim())}</a>` : v('phone');
  return { v, address, mail, phone };
}

const STAND = 'Stand: Oktober 2026';

function impressum(d: LegalData) {
  const { v, address, mail, phone } = make(d);
  return `
<h3>Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)</h3>
<p>${address}</p>

<h3>Kontakt</h3>
<p>E-Mail: ${mail}<br>Telefon: ${phone}</p>
${d.vatId?.trim() ? `<h3>Umsatzsteuer</h3><p>Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz: ${v('vatId')}</p>` : ''}

<h3>Verantwortlich für den Inhalt nach § 18 Abs. 2 Medienstaatsvertrag (MStV)</h3>
<p>${address}</p>

<h3>Verbraucherstreitbeilegung</h3>
<p>Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>

<h3>Haftung für Inhalte</h3>
<p>Als Diensteanbieter sind wir nach den allgemeinen Gesetzen für eigene Inhalte auf diesen Seiten verantwortlich. Wir sind jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben unberührt. Eine Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden entsprechender Rechtsverletzungen entfernen wir diese Inhalte umgehend.</p>

<h3>Haftung für Links</h3>
<p>Unser Angebot enthält gegebenenfalls Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Für diese fremden Inhalte können wir keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Links umgehend.</p>

<h3>Urheberrecht</h3>
<p>Die durch uns erstellten Inhalte und Werke auf diesen Seiten, insbesondere die gezeigten Motive, Illustrationen, Designs, Fotos, Animationen und Tonaufnahmen, unterliegen dem deutschen Urheberrecht. Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechts bedürfen der schriftlichen Zustimmung des jeweiligen Rechteinhabers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit Inhalte nicht von uns erstellt wurden, werden die Urheberrechte Dritter beachtet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden von Rechtsverletzungen entfernen wir derartige Inhalte umgehend.</p>
<p class="stand">${STAND}</p>`;
}

function datenschutz(d: LegalData) {
  const { v, address, mail, phone } = make(d);
  return `
<h3>1. Verantwortlicher</h3>
<p>Verantwortlich für die Verarbeitung personenbezogener Daten auf dieser Website im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:</p>
<p>${address}<br>E-Mail: ${mail}<br>Telefon: ${phone}</p>

<h3>2. Überblick</h3>
<p>Wir verarbeiten personenbezogene Daten nur, soweit das für den Betrieb dieser Website, die Abwicklung Ihrer Bestellung und die Beantwortung Ihrer Anfragen erforderlich ist oder Sie eingewilligt haben. Wir setzen <strong>keine Analyse- oder Tracking-Werkzeuge</strong> ein, schalten <strong>keine Werbung</strong> und binden <strong>keine Social-Media-Plugins</strong> ein. Die verwendeten Schriftarten werden von unserem eigenen Server ausgeliefert, nicht von einem Drittanbieter.</p>

<h3>3. Hosting und Server-Logfiles</h3>
<p>Diese Website wird bei folgendem Anbieter gehostet: ${v('hosting')}. Beim Aufruf der Seite verarbeitet der Server technisch notwendige Daten, insbesondere die IP-Adresse, Datum und Uhrzeit des Abrufs, die abgerufene Datei, die Menge der übertragenen Daten, den Browsertyp samt Version, das Betriebssystem und die zuvor besuchte Seite. Das ist erforderlich, um die Seite auszuliefern und ihre Sicherheit und Stabilität zu gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren und fehlerfreien Betrieb). Die Logdaten werden nach kurzer Zeit gelöscht, soweit sie nicht zur Aufklärung eines Sicherheitsvorfalls benötigt werden.</p>

<h3>4. Speicherung im Browser (kein Tracking)</h3>
<p>Diese Website speichert wenige Einstellungen lokal in Ihrem Browser (Local Storage), damit sie so aussieht und sich so verhält, wie Sie es gewählt haben: Ihre Darstellungseinstellungen (Hell/Dunkel, Highlight-Farbe, Flackern) und ob der Ton des Feuerwerks ein- oder ausgeschaltet ist. Diese Angaben bleiben auf Ihrem Gerät und werden nicht an uns übertragen. Sie sind für die von Ihnen ausdrücklich gewünschte Funktion erforderlich (§ 25 Abs. 2 Nr. 2 Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz, TDDDG; ergänzend Art. 6 Abs. 1 lit. f DSGVO). Sie können die Daten jederzeit in den Einstellungen Ihres Browsers löschen.</p>
<p>Ein Cookie setzen wir ausschließlich nach der Anmeldung im Verwaltungsbereich der Website (nur für den Betreiber). Besucher erhalten keine Cookies von uns.</p>
<p>Der Ton des Feuerwerks wird erst nach Ihrer ersten Interaktion mit der Seite abgespielt und kann jederzeit im Fußbereich ausgeschaltet werden.</p>

<h3>5. Onlineshop und Bestellabwicklung über Shopify</h3>
<p>Für Produktverwaltung, Warenkorb, Bestellung und Bezahlung nutzen wir das Shopify-Shopsystem der Shopify International Limited, Victoria Buildings, 2nd Floor, 1-2 Haddington Road, Dublin 4, D04 XN32, Irland, sowie der Shopify Inc., 151 O’Connor Street, Ground floor, Ottawa, Ontario, K2P 2L8, Kanada (zusammen „Shopify“).</p>
<p>Beim Aufruf dieser Seite lädt Ihr Browser Produktdaten und Produktbilder von Servern von Shopify. Dabei wird Ihre IP-Adresse an Shopify übermittelt. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer funktionierenden Produktdarstellung).</p>
<p>Wenn Sie „Zur Kasse“ wählen, werden Sie auf die Bestellseite (Checkout) von Shopify weitergeleitet. Dort erheben wir bzw. Shopify die für den Kauf erforderlichen Daten: Name, Anschrift, E-Mail-Adresse, ggf. Telefonnummer, bestellte Artikel, Zahlungsdaten und Versandart. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Durchführung des Vertrags). Shopify verarbeitet Daten in unserem Auftrag (Auftragsverarbeitung nach Art. 28 DSGVO) und teilweise auch als eigener Verantwortlicher, etwa zur Betrugsprävention. Dabei kann es zu einer Übermittlung in Drittländer, insbesondere die USA und Kanada, kommen. Diese stützt sich auf Angemessenheitsbeschlüsse der EU-Kommission (u. a. das EU-U.S. Data Privacy Framework) bzw. auf Standardvertragsklauseln. Weitere Informationen finden Sie in der Datenschutzerklärung von Shopify.</p>

<h3>6. Zahlungsabwicklung</h3>
<p>Die Zahlung wickeln Zahlungsdienstleister ab, die Ihnen im Checkout angezeigt werden: ${v('payment')}. Ihre Zahlungsdaten geben Sie direkt dort ein, wir erhalten sie nicht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Es gelten ergänzend die Datenschutzbestimmungen des jeweiligen Zahlungsdienstleisters.</p>

<h3>7. Versand und Produktion</h3>
<p>Zur Lieferung geben wir Ihren Namen, Ihre Lieferanschrift und, falls für die Zustellung nötig, Ihre E-Mail-Adresse oder Telefonnummer an das von uns beauftragte Versandunternehmen weiter. Soweit wir Produktion und Versand über Dienstleister (z. B. Druck- und Fulfillment-Partner) abwickeln, erhalten diese die für die Ausführung Ihrer Bestellung erforderlichen Daten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.</p>

<h3>8. Kontaktaufnahme</h3>
<p>Wenn Sie uns per E-Mail oder Telefon kontaktieren, verarbeiten wir Ihre Angaben (z. B. Name, Kontaktdaten, Inhalt der Anfrage), um Ihr Anliegen zu bearbeiten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit es um einen Vertrag oder vorvertragliche Maßnahmen geht, sonst Art. 6 Abs. 1 lit. f DSGVO. Wir löschen die Daten, sobald Ihre Anfrage erledigt ist und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>

<h3>9. Widerruf von Verträgen</h3>
<p>Wenn Sie einen Vertrag widerrufen, auch über die Widerrufsfunktion dieser Website, verarbeiten wir die dafür erforderlichen Angaben (Name, Kontaktdaten, Bestellung, Inhalt und Zeitpunkt der Erklärung), um den Widerruf zuzuordnen, zu bestätigen und abzuwickeln. Rechtsgrundlage sind Art. 6 Abs. 1 lit. b und lit. c DSGVO (rechtliche Verpflichtung).</p>

<h3>10. Speicherdauer</h3>
<p>Wir speichern personenbezogene Daten nur so lange, wie es für die genannten Zwecke erforderlich ist. Bestell- und Rechnungsdaten bewahren wir wegen handels- und steuerrechtlicher Pflichten (§ 257 Handelsgesetzbuch, § 147 Abgabenordnung) in der Regel sechs bzw. zehn Jahre auf. Danach werden sie gelöscht.</p>

<h3>11. Ihre Rechte</h3>
<p>Sie haben gegenüber uns folgende Rechte hinsichtlich der Sie betreffenden personenbezogenen Daten: Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen, die auf Art. 6 Abs. 1 lit. f DSGVO beruhen (Art. 21). Eine erteilte Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen. Wenden Sie sich dazu an die oben genannte Kontaktadresse.</p>
<p>Außerdem haben Sie das Recht, sich bei einer Datenschutz-Aufsichtsbehörde zu beschweren (Art. 77 DSGVO). Für uns zuständig ist: ${v('authority')}. Sie können sich auch an die Aufsichtsbehörde an Ihrem gewöhnlichen Aufenthaltsort wenden.</p>

<h3>12. Pflicht zur Bereitstellung, automatisierte Entscheidungen</h3>
<p>Für den Kauf sind Name, Anschrift und E-Mail-Adresse erforderlich; ohne sie können wir den Vertrag nicht erfüllen. Eine automatisierte Entscheidungsfindung einschließlich Profiling nach Art. 22 DSGVO findet durch uns nicht statt.</p>

<h3>13. Sicherheit</h3>
<p>Die Übertragung zwischen Ihrem Browser und dieser Website sowie dem Checkout erfolgt verschlüsselt (TLS/HTTPS). Wir treffen technische und organisatorische Maßnahmen, um Ihre Daten vor Verlust, Missbrauch und unbefugtem Zugriff zu schützen.</p>

<h3>14. Änderungen</h3>
<p>Wir passen diese Erklärung an, wenn sich unsere Website oder die Rechtslage ändert. Es gilt die jeweils hier veröffentlichte Fassung.</p>
<p class="stand">${STAND}</p>`;
}

function versand(d: LegalData) {
  const { v, address, mail, phone } = make(d);
  return `
<h3>Lieferung</h3>
<p><strong>Versandländer:</strong> ${v('shipCountries')}<br>
<strong>Lieferzeit:</strong> ${v('deliveryTime')}<br>
<strong>Versandkosten:</strong> ${v('shippingCosts')}</p>
<p>Die Lieferzeit beginnt, sobald Ihre Zahlung bei uns eingegangen ist bzw. bei Zahlungsarten ohne Vorauszahlung mit der Bestellung. Alle Artikel sind streng limitiert; ist ein Artikel nicht mehr verfügbar, informieren wir Sie unverzüglich und erstatten bereits geleistete Zahlungen.</p>

<h3>Preise und Zahlung</h3>
<p>Alle Preise sind Endpreise in Euro. ${v('vatNote')} Die verfügbaren Zahlungsarten werden Ihnen im Checkout angezeigt. Bis zur vollständigen Bezahlung bleibt die Ware unser Eigentum.</p>

<h3>Beschädigte Ware</h3>
<p>Wird Ihnen Ware mit einem erkennbaren Transportschaden geliefert, melden Sie das bitte möglichst sofort dem Zusteller und uns (mit Foto). Ihre gesetzlichen Rechte werden dadurch nicht eingeschränkt.</p>

<h3>Widerrufsbelehrung</h3>
<h4>Widerrufsrecht</h4>
<p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.</p>
<p>Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die Waren in Besitz genommen haben bzw. hat. Bei der Bestellung mehrerer Waren in einer Bestellung, die getrennt geliefert werden, beginnt die Frist mit dem Tag, an dem Sie oder ein von Ihnen benannter Dritter, der nicht der Beförderer ist, die letzte Ware in Besitz genommen haben bzw. hat.</p>
<p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns</p>
<p>${address}<br>E-Mail: ${mail}<br>Telefon: ${phone}</p>
<p>mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das untenstehende Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist.</p>
<p>Sie können Ihr Widerrufsrecht auch online unter ${v('withdrawalUrl')} ausüben. Wenn Sie von dieser Möglichkeit Gebrauch machen, übermitteln wir Ihnen unverzüglich (z. B. per E-Mail) eine Eingangsbestätigung mit Informationen zum Inhalt der Widerrufserklärung sowie dem Datum und der Uhrzeit ihres Eingangs.</p>
<p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.</p>

<h4>Folgen des Widerrufs</h4>
<p>Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.</p>
<p>Wir können die Rückzahlung verweigern, bis wir die Waren wieder zurückerhalten haben oder bis Sie den Nachweis erbracht haben, dass Sie die Waren zurückgesandt haben, je nachdem, welches der frühere Zeitpunkt ist.</p>
<p>Sie haben die Waren unverzüglich und in jedem Fall spätestens binnen vierzehn Tagen ab dem Tag, an dem Sie uns über den Widerruf dieses Vertrags unterrichten, an uns zurückzusenden oder zu übergeben. Die Frist ist gewahrt, wenn Sie die Waren vor Ablauf der Frist von vierzehn Tagen absenden.</p>
<p>Sie tragen die unmittelbaren Kosten der Rücksendung der Waren.</p>
<p>Sie müssen für einen etwaigen Wertverlust der Waren nur aufkommen, wenn dieser Wertverlust auf einen zur Prüfung der Beschaffenheit, Eigenschaften und Funktionsweise der Waren nicht notwendigen Umgang mit ihnen zurückzuführen ist.</p>

<h4>Ausschluss des Widerrufsrechts</h4>
<p>Das Widerrufsrecht besteht nicht bei Verträgen zur Lieferung von Waren, die nicht vorgefertigt sind und für deren Herstellung eine individuelle Auswahl oder Bestimmung durch den Verbraucher maßgeblich ist oder die eindeutig auf die persönlichen Bedürfnisse des Verbrauchers zugeschnitten sind (§ 312g Abs. 2 Nr. 1 BGB), etwa personalisierte Artikel, soweit wir solche anbieten.</p>

<h4>Muster-Widerrufsformular</h4>
<p>(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)</p>
<p>An ${address}, E-Mail: ${mail}:</p>
<p>Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)<br>
Bestellt am (*) / erhalten am (*)<br>
Name des/der Verbraucher(s)<br>
Anschrift des/der Verbraucher(s)<br>
Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)<br>
Datum<br>
(*) Unzutreffendes streichen.</p>

<h3>Rücksendung</h3>
<p>Bitte schicken Sie Rücksendungen an die oben genannte Anschrift. Teilen Sie uns vorher kurz per E-Mail Ihre Bestellnummer mit, damit wir die Rücksendung zuordnen können. Bitte senden Sie die Ware möglichst originalverpackt, sauber und ungetragen zurück. Das ist keine Voraussetzung für Ihr Widerrufsrecht, hilft uns aber bei der schnellen Erstattung.</p>

<h3>Gesetzliche Mängelhaftung</h3>
<p>Es gilt das gesetzliche Mängelhaftungsrecht. Hat die Ware einen Mangel, kontaktieren Sie uns bitte mit Foto und Bestellnummer. Wir sorgen dann nach Ihrer Wahl für Nachbesserung oder Ersatzlieferung oder erstatten den Kaufpreis nach den gesetzlichen Vorgaben. Die Verjährungsfrist beträgt für neue Waren zwei Jahre ab Ablieferung. Die Kosten der Rücksendung mangelhafter Ware tragen wir.</p>
<p class="stand">${STAND}</p>`;
}

function kontakt(d: LegalData) {
  const { address, mail, phone } = make(d);
  return `
<p>Fragen zu einem Shirt, zur Bestellung, zum Versand oder zur Rückgabe? Schreiben Sie uns, wir melden uns so schnell wie möglich. Bitte nennen Sie bei Fragen zu einer Bestellung Ihre Bestellnummer.</p>
<h3>E-Mail</h3>
<p>${mail}</p>
<h3>Telefon</h3>
<p>${phone}</p>
<h3>Anschrift</h3>
<p>${address}</p>
<h3>Weitere Informationen</h3>
<p>Antworten zu Lieferzeit, Versandkosten, Widerruf und Rückgabe finden Sie unter <a href="#versand" data-legal="versand">Versand &amp; Rückgabe</a>. Wie wir mit Ihren Daten umgehen, steht in der <a href="#datenschutz" data-legal="datenschutz">Datenschutzerklärung</a>; die Anbieterkennzeichnung finden Sie im <a href="#impressum" data-legal="impressum">Impressum</a>.</p>`;
}

const PAGES: Record<LegalPage, { title: string; render: (d: LegalData) => string }> = {
  kontakt:     { title: 'Kontakt',              render: kontakt },
  versand:     { title: 'Versand & Rückgabe',   render: versand },
  impressum:   { title: 'Impressum',            render: impressum },
  datenschutz: { title: 'Datenschutzerklärung', render: datenschutz },
};
const isPage = (h: string): h is LegalPage => h in PAGES;

/* ---------- Anzeige: Glas-Karte über der Seite, per Link oder Adresse (#impressum …) erreichbar ---------- */
let data: LegalData = { ...LEGAL_DEFAULTS };
let refresh: (() => void) | null = null;
/** Vom CMS aufgerufen, sobald sich die Betreiberangaben ändern. */
export function setLegalData(d: LegalData) { data = { ...LEGAL_DEFAULTS, ...d }; refresh?.(); }

export function initLegal(hooks: { lock: () => void; unlock: () => void }) {
  const root = document.createElement('div');
  root.className = 'legal'; root.id = 'legal'; root.hidden = true;
  root.innerHTML = `
    <div class="legal-card" role="dialog" aria-modal="true" aria-labelledby="legal-title" tabindex="-1">
      <header class="legal-head"><h2 id="legal-title"></h2><button type="button" class="legal-x" aria-label="Schließen">×</button></header>
      <div class="legal-body" data-lenis-prevent></div>
    </div>`;
  document.body.appendChild(root);
  const card = root.querySelector<HTMLElement>('.legal-card')!;
  const title = root.querySelector<HTMLElement>('#legal-title')!;
  const body = root.querySelector<HTMLElement>('.legal-body')!;
  let current: LegalPage | null = null;
  let opener: HTMLElement | null = null;

  const render = () => { if (current) body.innerHTML = PAGES[current].render(data); };
  refresh = render;

  function open(page: LegalPage, from?: HTMLElement | null) {
    const wasOpen = !!current;
    current = page;
    if (from) opener = from;
    title.textContent = PAGES[page].title;
    render();
    body.scrollTop = 0;
    root.hidden = false;
    requestAnimationFrame(() => root.classList.add('open'));
    if (!wasOpen) hooks.lock();
    if (location.hash !== `#${page}`) history.pushState(null, '', `#${page}`);
    card.focus({ preventScroll: true });
  }
  function close(updateUrl = true) {
    if (!current) return;
    current = null;
    root.classList.remove('open');
    setTimeout(() => { if (!current) root.hidden = true; }, 350);
    hooks.unlock();
    if (updateUrl && isPage(location.hash.slice(1))) history.pushState(null, '', location.pathname + location.search);
    opener?.focus({ preventScroll: true });
  }

  // Links im Fußbereich und in den Texten selbst
  document.addEventListener('click', e => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[data-legal]');
    if (!a) return;
    e.preventDefault();
    open(a.dataset.legal as LegalPage, current ? opener : a);
  });
  root.querySelector('.legal-x')!.addEventListener('click', () => close());
  root.addEventListener('click', e => { if (e.target === root) close(); });   // Klick neben die Karte
  document.addEventListener('keydown', e => {
    if (!current) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'Tab') {                                                      // Fokus bleibt in der Karte
      const f = [...card.querySelectorAll<HTMLElement>('a[href], button')].filter(el => !el.hidden);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Direkt-Link (…/#impressum) und Zurück-Taste des Browsers
  const fromHash = () => {
    const h = location.hash.slice(1);
    if (isPage(h)) open(h); else close(false);
  };
  window.addEventListener('popstate', fromHash);
  window.addEventListener('hashchange', fromHash);
  if (isPage(location.hash.slice(1))) setTimeout(fromHash, 0);
}
