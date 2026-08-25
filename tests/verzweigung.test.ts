import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { rendere } from '../src/renderer.ts';
import { kantenDurchElemente, liesStruktur, ueberlappendePaare, type Struktur } from './struktur.ts';

async function erzeuge(beschreibung: string) {
  return rendere({ beschreibung });
}

/** Erzeugt und besteht darauf, dass ein Diagramm herauskommt. */
async function struktur(beschreibung: string): Promise<Struktur> {
  const ergebnis = await erzeuge(beschreibung);
  expect(ergebnis.pruefung.fehler).toEqual([]);
  return liesStruktur(ergebnis.diagramm!);
}

async function abgelehnt(beschreibung: string) {
  const ergebnis = await erzeuge(beschreibung);
  expect(ergebnis.diagramm).toBeNull();
  expect(ergebnis.pruefung.fehler.length).toBeGreaterThan(0);
  return ergebnis.pruefung.fehler;
}

/** Findet einen Fluss über die Namen seiner beiden Enden. */
function fluss(s: Struktur, vonName: string, nachName: string) {
  const id = (name: string) => s.elemente.find((e) => e.name === name)?.id;
  return s.fluesse.find((f) => f.von === id(vonName) && f.nach === id(nachName));
}

const URLAUB = `prozess: urlaub
name: Urlaubsantrag
start:
  name: Antrag eingegangen
ablauf:
  - frage: Mehr als zehn Tage?
    wenn: =tage > 10
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Bestätigen
  - ende: Antrag bearbeitet
`;

describe('Verzweigung', () => {
  it('erzeugt ein exklusives Gateway mit dem Text der Frage', async () => {
    const s = await struktur(URLAUB);
    const gateways = s.elemente.filter((e) => e.typ === 'bpmn:ExclusiveGateway');
    expect(gateways.map((g) => g.name)).toEqual(['Mehr als zehn Tage?', undefined]);
  });

  it('hängt die FEEL-Bedingung an den Fluss des `dann:`-Zweigs, nicht an einen anderen', async () => {
    const s = await struktur(URLAUB);
    expect(fluss(s, 'Mehr als zehn Tage?', 'Freigabe Geschäftsführung')?.bedingung).toBe('=tage > 10');
    expect(fluss(s, 'Mehr als zehn Tage?', 'Bestätigen')?.bedingung).toBeUndefined();
  });

  it('macht den Zweig ohne Bedingung zum Standardpfad', async () => {
    const s = await struktur(URLAUB);
    const gateway = s.elemente.find((e) => e.name === 'Mehr als zehn Tage?')!;
    expect(gateway.standardFluss).toBe(fluss(s, 'Mehr als zehn Tage?', 'Bestätigen')?.id);
  });

  it('führt die Zweige zusammen, ohne dass der Autor das beschreiben muss', async () => {
    const s = await struktur(URLAUB);
    const zusammen = s.elemente.find((e) => e.typ === 'bpmn:ExclusiveGateway' && e.name === undefined)!;
    expect(zusammen).toBeDefined();

    const hinein = s.fluesse.filter((f) => f.nach === zusammen.id).map((f) => f.von).sort();
    const erwartet = ['Freigabe Geschäftsführung', 'Bestätigen']
      .map((n) => s.elemente.find((e) => e.name === n)!.id)
      .sort();
    expect(hinein).toEqual(erwartet);

    const hinaus = s.fluesse.filter((f) => f.von === zusammen.id);
    expect(hinaus).toHaveLength(1);
    expect(s.elemente.find((e) => e.id === hinaus[0]!.nach)?.name).toBe('Antrag bearbeitet');
  });

  it('gibt dem zusammenführenden Gateway eine ID, die über Runden hält', async () => {
    const erste = await struktur(URLAUB);
    const zweite = await struktur(URLAUB);
    expect(zweite.elemente.map((e) => e.id)).toEqual(erste.elemente.map((e) => e.id));
    expect(erste.elemente.map((e) => e.id)).toContain('Zusammenfuehrung_MehrAlsZehnTage');
  });

  it('legt ein lesbares Bild: nichts überlappt, keine Kante läuft durch ein Element', async () => {
    const s = await struktur(URLAUB);
    expect(ueberlappendePaare(s)).toEqual([]);
    expect(kantenDurchElemente(s)).toEqual([]);
  });

  it('beschriftet die Zweige, damit das Bild ohne die Beschreibung lesbar ist', async () => {
    const s = await struktur(URLAUB);
    expect(fluss(s, 'Mehr als zehn Tage?', 'Freigabe Geschäftsführung')?.name).toBe('ja');
    expect(fluss(s, 'Mehr als zehn Tage?', 'Bestätigen')?.name).toBe('nein');
  });
});

describe('Durchfallen', () => {
  const NUR_DANN = `prozess: durchfall
start:
  name: Los
ablauf:
  - frage: Auffällig?
    wenn: =auffaellig
    dann:
      - mensch: Genauer ansehen
  - mensch: Abschließen
  - ende: Fertig
`;

  it('lässt einen Zweig ohne `sonst:` hinter dem `frage:`-Block weiterlaufen', async () => {
    const s = await struktur(NUR_DANN);
    // Der `nein`-Fluss geht direkt an die Zusammenführung, der Zweig selbst hat keine Elemente.
    const zusammen = s.elemente.find((e) => e.typ === 'bpmn:ExclusiveGateway' && e.name === undefined)!;
    expect(fluss(s, 'Auffällig?', 'Genauer ansehen')?.bedingung).toBe('=auffaellig');
    expect(s.fluesse.find((f) => f.von === s.elemente.find((e) => e.name === 'Auffällig?')!.id && f.nach === zusammen.id))
      .toBeDefined();
    expect(s.elemente.find((e) => e.id === s.fluesse.find((f) => f.von === zusammen.id)!.nach)?.name)
      .toBe('Abschließen');
  });

  it('lässt einen fehlenden `dann:`-Zweig ebenso durchfallen und behält die Bedingung dort', async () => {
    const s = await struktur(`prozess: durchfall
ablauf:
  - frage: Geklärt?
    wenn: =geklaert
    sonst:
      - ende: Abgelehnt
  - mensch: Weitermachen
  - ende: Fertig
`);
    // Nur ein offener Ausgang (der `sonst:`-Zweig endet) — also keine Zusammenführung nötig.
    expect(s.elemente.filter((e) => e.typ === 'bpmn:ExclusiveGateway')).toHaveLength(1);
    expect(fluss(s, 'Geklärt?', 'Weitermachen')?.bedingung).toBe('=geklaert');
    expect(fluss(s, 'Geklärt?', 'Abgelehnt')?.bedingung).toBeUndefined();
  });
});

describe('verschachtelte Verzweigungen', () => {
  it('bildet eine Verzweigung innerhalb eines Zweigs ab', async () => {
    const s = await struktur(`prozess: tief
ablauf:
  - frage: Abweichung?
    wenn: =abweichung
    dann:
      - mensch: Klären
      - frage: Geklärt?
        wenn: =geklaert
        sonst:
          - ende: Abgelehnt
  - mensch: Buchen
  - ende: Bezahlt
`);
    expect(s.elemente.filter((e) => e.typ === 'bpmn:ExclusiveGateway').map((e) => e.name)).toEqual([
      'Abweichung?',
      'Geklärt?',
      undefined,
    ]);
    // Der durchfallende `dann:`-Zweig der inneren Frage landet an derselben Zusammenführung
    // wie der `sonst:`-Zweig der äußeren.
    const zusammen = s.elemente.find((e) => e.typ === 'bpmn:ExclusiveGateway' && e.name === undefined)!;
    expect(s.fluesse.filter((f) => f.nach === zusammen.id)).toHaveLength(2);
    expect(ueberlappendePaare(s)).toEqual([]);
    expect(kantenDurchElemente(s)).toEqual([]);
  });
});

describe('Service Task', () => {
  const SYSTEM = `prozess: buchen
ablauf:
  - system: Rechnung buchen
    job-type: rechnung-buchen
  - ende: Gebucht
`;

  it('trägt den beschriebenen Job-Type', async () => {
    const s = await struktur(SYSTEM);
    const task = s.elemente.find((e) => e.typ === 'bpmn:ServiceTask')!;
    expect(task.name).toBe('Rechnung buchen');
    expect(task.jobType).toBe('rechnung-buchen');
  });

  it('verlangt einen Job-Type, statt ein Bild ohne Worker zu erzeugen', async () => {
    const fehler = await abgelehnt(`prozess: buchen
ablauf:
  - system: Rechnung buchen
  - ende: Gebucht
`);
    expect(fehler[0]!.text).toMatch(/job-type/);
    expect(fehler[0]!.zeile).toBe(3);
  });
});

describe('Rücksprung', () => {
  const RUECKSPRUNG = `prozess: schleife
ablauf:
  - system: Prüfen
    marke: pruefung
    job-type: pruefen
  - frage: In Ordnung?
    wenn: =inOrdnung
    sonst:
      - mensch: Korrigieren
      - weiter-bei: pruefung
  - ende: Fertig
`;

  it('springt vom `weiter-bei:` zurück auf den Schritt mit der `marke:`', async () => {
    const s = await struktur(RUECKSPRUNG);
    expect(fluss(s, 'Korrigieren', 'Prüfen')).toBeDefined();
    const pruefen = s.elemente.find((e) => e.name === 'Prüfen')!;
    expect(s.fluesse.filter((f) => f.nach === pruefen.id)).toHaveLength(2);
    expect(ueberlappendePaare(s)).toEqual([]);
    expect(kantenDurchElemente(s)).toEqual([]);
  });

  it('lehnt eine unbekannte Marke mit der Zeile des Sprungs ab', async () => {
    const fehler = await abgelehnt(`prozess: schleife
ablauf:
  - mensch: Prüfen
  - frage: In Ordnung?
    wenn: =inOrdnung
    sonst:
      - weiter-bei: pruefung
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/Marke `pruefung`/);
    expect(fehler[0]!.zeile).toBe(7);
  });

  it('lehnt zwei gleiche Marken ab', async () => {
    const fehler = await abgelehnt(`prozess: schleife
ablauf:
  - mensch: Eins
    marke: hier
  - mensch: Zwei
    marke: hier
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/`hier`/);
    expect(fehler[0]!.zeile).toBe(6);
  });
});

describe('das Schema lehnt ab, was es nicht abbilden kann', () => {
  it('verlangt zu jeder `frage:` eine Bedingung', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - frage: Wirklich?
    dann:
      - ende: Ja
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/wenn/);
  });

  it('verlangt eine Bedingung, die als FEEL-Ausdruck geschrieben ist', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - frage: Wirklich?
    wenn: tage > 10
    dann:
      - ende: Ja
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/`=`/);
    expect(fehler[0]!.zeile).toBe(4);
  });

  it('verlangt zu jeder `frage:` mindestens einen Zweig', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - frage: Wirklich?
    wenn: =ja
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/mindestens einen Zweig/);
  });

  it('nimmt keinen leeren Zweig — der wird weggelassen, nicht hingeschrieben', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - frage: Wirklich?
    wenn: =ja
    dann: []
    sonst:
      - ende: Nein
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/leer/);
  });

  it('lässt nach einem `weiter-bei:` nichts mehr folgen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: Eins
    marke: hier
  - frage: Nochmal?
    wenn: =nochmal
    dann:
      - weiter-bei: hier
      - mensch: Zu spät
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/nur der letzte Schritt/);
    expect(fehler[0]!.zeile).toBe(8);
  });

  it('lässt nach einer Verzweigung, deren Zweige alle enden, nichts mehr folgen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - frage: Wirklich?
    wenn: =ja
    dann:
      - ende: Ja
    sonst:
      - ende: Nein
  - mensch: Nie erreicht
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/kein Zweig erreichen/);
    expect(fehler[0]!.zeile).toBe(3);
  });

  it('kennt `gruppe:` noch nicht und sagt das, statt es wegzulassen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: Abweichung klären
    gruppe: Einkauf
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/Unbekannter Schlüssel `gruppe`/);
    expect(fehler[0]!.zeile).toBe(4);
  });
});

/**
 * Der absichtlich harte Prüfprozess, an dem die verschachtelte Form für Verzweigungen
 * entschieden wurde — verschachtelte Gateways, ein Rücksprung, mehrere Enden. Er wird gegen
 * die Handübersetzung in `tests/fixtures/rechnungsfreigabe.bpmn` gehalten: was das Werkzeug
 * erzeugt, muss dieselbe Struktur haben wie das, was ein Mensch gezeichnet hätte.
 *
 * Ohne die Datenfluss-Angaben (`eingang:`, `erzeugt:`) und ohne `gruppe:` — Zuständigkeiten
 * kann das Schema heute nicht und lehnt sie ausdrücklich ab.
 */
const RECHNUNGSFREIGABE = `prozess: rechnungsfreigabe
name: Rechnungsfreigabe
start:
  name: Rechnung eingegangen
ablauf:
  - system: Rechnung gegen Bestellung prüfen
    marke: pruefung
    job-type: rechnung-pruefen

  - frage: Gibt es eine Abweichung?
    wenn: =abweichung
    dann:
      - mensch: Abweichung klären
      - frage: Konnte geklärt werden?
        wenn: =geklaert
        sonst:
          - ende: Rechnung abgelehnt

  - frage: Liegt der Betrag über 5000?
    wenn: =rechnungsbetrag > 5000
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Freigabe Fachbereich

  - frage: Wurde freigegeben?
    wenn: =freigegeben
    sonst:
      - mensch: Rechnung korrigieren
      - weiter-bei: pruefung

  - system: Rechnung buchen
    job-type: rechnung-buchen

  - system: Zahlung anstoßen
    job-type: zahlung-anstossen

  - ende: Rechnung bezahlt
`;

/** Elemente und Kanten über Typ und Name — IDs unterscheiden sich zwischen Hand und Werkzeug. */
function signatur(s: Struktur) {
  const bezeichnung = (id: string) => {
    const e = s.elemente.find((k) => k.id === id)!;
    return `${e.typ}:${e.name ?? ''}`;
  };
  return {
    elemente: s.elemente.map((e) => `${e.typ}:${e.name ?? ''}`).sort(),
    kanten: s.fluesse.map((f) => `${bezeichnung(f.von)} -> ${bezeichnung(f.nach)}`).sort(),
  };
}

describe('der Prüfprozess aus Ticket 01', () => {
  it('lässt sich rendern und ergibt dieselbe Struktur wie die Handübersetzung', async () => {
    const erzeugt = await struktur(RECHNUNGSFREIGABE);
    const handarbeit = await liesStruktur(
      await readFile('tests/fixtures/rechnungsfreigabe.bpmn', 'utf8'),
    );

    // Das Urteil aus Ticket 01 nennt 16 Knoten und 18 Flüsse.
    expect(erzeugt.elemente).toHaveLength(16);
    expect(erzeugt.fluesse).toHaveLength(18);
    expect(signatur(erzeugt)).toEqual(signatur(handarbeit));
  });

  it('besteht den Linter und legt ein lesbares Bild', async () => {
    const ergebnis = await erzeuge(RECHNUNGSFREIGABE);
    expect(ergebnis.pruefung.fehler).toEqual([]);
    const s = await liesStruktur(ergebnis.diagramm!);
    expect(s.warnungen).toEqual([]);
    expect(ueberlappendePaare(s)).toEqual([]);
    expect(kantenDurchElemente(s)).toEqual([]);
  });
});
