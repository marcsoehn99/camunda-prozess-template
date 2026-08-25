const UMLAUTE: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss',
};

/** Zerlegt einen gesprochenen Namen in Wörter aus reinem ASCII. */
function woerter(text: string): string[] {
  const entschaerft = text.replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z] ?? z);
  return entschaerft
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((wort) => wort !== '');
}

/** Nur den ersten Buchstaben anfassen — `rechnungsBetrag` soll seinen Höcker behalten. */
const gross = (wort: string): string => wort[0]!.toUpperCase() + wort.slice(1);
const klein = (wort: string): string => wort[0]!.toLowerCase() + wort.slice(1);

/**
 * Macht aus einem gesprochenen Namen einen stabilen Bezeichner:
 * „Freigabe erteilen" wird zu „FreigabeErteilen".
 *
 * Stabil heißt: gleiche Beschreibung, gleiche IDs — auch über Runden hinweg.
 * Ohne das verlieren übernommene Positionen (Ticket 04) ihren Anker.
 */
export function bezeichner(text: string): string {
  const zusammen = woerter(text).map(gross).join('');
  return zusammen === '' ? 'Schritt' : zusammen;
}

/**
 * Macht aus einem gesprochenen Begriff einen Variablennamen:
 * „Abweichung gefunden" wird zu „abweichungGefunden".
 *
 * Ein schon technisch geschriebener Begriff bleibt dabei, was er ist: `rechnungsbetrag` wird
 * `rechnungsbetrag`. `undefined` heißt, dass daraus kein Name werden kann, den FEEL lesen kann —
 * der Aufrufer meldet das, statt ersatzweise etwas anderes zu erzeugen.
 */
export function variablenName(text: string): string | undefined {
  const teile = woerter(text);
  if (teile.length === 0) return undefined;
  const zusammen = klein(teile[0]!) + teile.slice(1).map(gross).join('');
  return /^[A-Za-z_]/.test(zusammen) ? zusammen : undefined;
}

/** Hängt `_2`, `_3` … an, bis der Bezeichner im Diagramm einmalig ist. */
export function eindeutig(basis: string, vergeben: Set<string>): string {
  let kandidat = basis;
  let zaehler = 2;
  while (vergeben.has(kandidat)) {
    kandidat = `${basis}_${zaehler}`;
    zaehler += 1;
  }
  vergeben.add(kandidat);
  return kandidat;
}
