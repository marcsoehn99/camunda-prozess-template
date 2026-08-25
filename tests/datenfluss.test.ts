import { describe, expect, it } from 'vitest';
import { rendere } from '../src/renderer.ts';
import { entferneZuordnung, liesStruktur } from './struktur.ts';

/**
 * Datenfluss: welche Variablen durch den Prozess laufen, woher sie kommen und unter welchem
 * Namen sie weiterlaufen. Geprüft wird ausschließlich am Seam.
 */

/** Ein Ausschnitt in der Form der vorhandenen Glossardatei des Projekts. */
const GLOSSAR = `# camundatest

## Language

**Diagramm**:
Die aus einer Prozess-Beschreibung erzeugte \`.bpmn\`-Datei. Sie wird nicht von Hand gepflegt.
_Avoid_: BPMN (das ist der Standard, nicht die Datei), Prozessdatei
`;

/** Der Datenfluss des Prüfprozesses aus Ticket 01, auf das Nötige zusammengezogen. */
const MIT_DATENFLUSS = `prozess: rechnungsfreigabe
start:
  name: Rechnung eingegangen
  eingang: [Rechnungsbetrag, Lieferant]
ablauf:
  - system: Rechnung prüfen
    job-type: rechnung-pruefen
    erzeugt: Abweichung
  - frage: Gibt es eine Abweichung?
    wenn: =abweichung
    dann:
      - mensch: Abweichung klären
        erzeugt: geklaert
  - ende: Fertig
`;

async function erzeuge(beschreibung: string, glossar?: string | null) {
  return rendere({ beschreibung, ...(glossar === undefined ? {} : { glossar }) });
}

const element = async (diagramm: string, name: string) =>
  (await liesStruktur(diagramm)).elemente.find((e) => e.name === name)!;

describe('ein Schritt, der ein Ergebnis weitergibt', () => {
  it('trägt die Zuordnung als Ausgabe im Diagramm und besteht den Linter', async () => {
    const { diagramm, pruefung } = await erzeuge(MIT_DATENFLUSS);
    expect(pruefung.fehler).toEqual([]);

    expect((await element(diagramm!, 'Rechnung prüfen')).ausgaben).toEqual([['=abweichung', 'abweichung']]);
    expect((await element(diagramm!, 'Abweichung klären')).ausgaben).toEqual([['=geklaert', 'geklaert']]);
  });

  it('macht aus dem gesprochenen Begriff einen Variablennamen, den FEEL lesen kann', async () => {
    const { diagramm } = await erzeuge(`prozess: p
ablauf:
  - mensch: Abweichung klären
    erzeugt: Abweichung geklärt
  - ende: Fertig
`);
    expect((await element(diagramm!, 'Abweichung klären')).ausgaben).toEqual([
      ['=abweichungGeklaert', 'abweichungGeklaert'],
    ]);
  });

  it('lässt einen schon technisch geschriebenen Begriff, wie er ist', async () => {
    const { diagramm } = await erzeuge(`prozess: p
ablauf:
  - mensch: Betrag erfassen
    erzeugt: rechnungsBetrag
  - ende: Fertig
`);
    expect((await element(diagramm!, 'Betrag erfassen')).ausgaben).toEqual([
      ['=rechnungsBetrag', 'rechnungsBetrag'],
    ]);
  });

  it('lehnt einen Begriff ab, aus dem kein Variablenname werden kann', async () => {
    const { diagramm, pruefung } = await erzeuge(`prozess: p
ablauf:
  - mensch: Betrag erfassen
    erzeugt: "1234"
  - ende: Fertig
`);
    expect(diagramm).toBeNull();
    expect(pruefung.fehler[0]!.text).toMatch(/kein Variablenname/);
    expect(pruefung.fehler[0]!.zeile).toBe(4);
  });
});

describe('eine Bedingung über eine erzeugte Variable', () => {
  it('hängt am Fluss des `dann:`-Zweigs', async () => {
    const { diagramm, pruefung } = await erzeuge(MIT_DATENFLUSS);
    expect(pruefung.fehler).toEqual([]);

    const struktur = await liesStruktur(diagramm!);
    const gateway = struktur.elemente.find((e) => e.typ === 'bpmn:ExclusiveGateway' && e.name)!;
    const bedingt = struktur.fluesse.filter((f) => f.von === gateway.id && f.bedingung !== undefined);
    expect(bedingt.map((f) => f.bedingung)).toEqual(['=abweichung']);
  });
});

describe('`eingang:` am Start', () => {
  it('wird angenommen und erzeugt kein Element im Diagramm', async () => {
    const ohne = await erzeuge(MIT_DATENFLUSS.replace('  eingang: [Rechnungsbetrag, Lieferant]\n', ''));
    const mit = await erzeuge(MIT_DATENFLUSS);

    expect(mit.pruefung.fehler).toEqual([]);
    const arten = async (diagramm: string) => (await liesStruktur(diagramm)).elemente.map((e) => e.typ);
    expect(await arten(mit.diagramm!)).toEqual(await arten(ohne.diagramm!));
  });

  it('lehnt eine leere Liste ab, statt sie zu übergehen', async () => {
    const { diagramm, pruefung } = await erzeuge(`prozess: p
start:
  eingang: []
ablauf:
  - ende: Fertig
`);
    expect(diagramm).toBeNull();
    expect(pruefung.fehler[0]!.text).toMatch(/`eingang:` ist leer/);
  });

  it('lehnt einen einzelnen Begriff ab, wo eine Liste stehen muss', async () => {
    const { pruefung } = await erzeuge(`prozess: p
start:
  eingang: Rechnungsbetrag
ablauf:
  - ende: Fertig
`);
    expect(pruefung.fehler[0]!.text).toMatch(/muss eine Liste von Begriffen sein/);
  });
});

describe('Variablennamen im Glossar', () => {
  it('werden ohne Rückfrage nachgetragen und am Ende des Laufs berichtet', async () => {
    const ergebnis = await erzeuge(MIT_DATENFLUSS, GLOSSAR);

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(ergebnis.neueBegriffe).toEqual([
      'Rechnungsbetrag → rechnungsbetrag',
      'Lieferant → lieferant',
      'Rechnung prüfen → rechnung-pruefen',
      'Abweichung → abweichung',
      'geklaert → geklaert',
    ]);
    expect(ergebnis.glossar).toContain('**Abweichung**:');
    expect(ergebnis.glossar).toContain('_Variablenname_: `abweichung`');
  });

  it('gewinnen gegen den Vorschlag, sobald der Autor sie im Glossar umbenennt', async () => {
    const erste = await erzeuge(MIT_DATENFLUSS, GLOSSAR);
    const umbenannt = erste.glossar!.replace('_Variablenname_: `abweichung`', '_Variablenname_: `abweichungGefunden`');
    const zweite = await erzeuge(MIT_DATENFLUSS, umbenannt);

    expect((await element(zweite.diagramm!, 'Rechnung prüfen')).ausgaben).toEqual([
      ['=abweichungGefunden', 'abweichungGefunden'],
    ]);
    expect(zweite.pruefung.warnungen.map((w) => w.text)).toContainEqual(
      expect.stringMatching(/Die Variable für „Abweichung" heißt im Glossar `abweichungGefunden`/),
    );
  });

  it('stehen in einer eigenen Zeile, damit ein Job-Type sie nicht überschreibt', async () => {
    const ergebnis = await erzeuge(`prozess: p
ablauf:
  - system: Rechnung buchen
    job-type: rechnung-buchen
    erzeugt: Rechnung buchen
  - ende: Fertig
`, GLOSSAR);

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(ergebnis.glossar).toContain('_Technischer Name_: `rechnung-buchen`');
    expect(ergebnis.glossar).toContain('_Variablenname_: `rechnungBuchen`');
    expect((await element(ergebnis.diagramm!, 'Rechnung buchen')).ausgaben).toEqual([
      ['=rechnungBuchen', 'rechnungBuchen'],
    ]);
  });

  it('bleiben aus, solange kein Glossar da ist', async () => {
    const ergebnis = await erzeuge(MIT_DATENFLUSS, null);
    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.glossar).toBeNull();
    expect((await element(ergebnis.diagramm!, 'Rechnung prüfen')).ausgaben).toEqual([
      ['=abweichung', 'abweichung'],
    ]);
  });
});

describe('eine Beschreibung ohne Datenfluss', () => {
  it('erzeugt Elemente ganz ohne Zuordnungen', async () => {
    const { diagramm, pruefung } = await erzeuge(`prozess: p
ablauf:
  - mensch: Freigabe erteilen
  - system: Rechnung buchen
    job-type: rechnung-buchen
  - ende: Fertig
`);
    expect(pruefung.fehler).toEqual([]);
    const struktur = await liesStruktur(diagramm!);
    expect(struktur.elemente.flatMap((e) => e.ausgaben)).toEqual([]);
    expect(diagramm).not.toContain('ioMapping');
  });
});

describe('eine von Hand entfernte Zuordnung', () => {
  it('gilt als Drift und hält den Lauf an, statt überschrieben zu werden', async () => {
    const { diagramm } = await erzeuge(MIT_DATENFLUSS);
    const id = (await element(diagramm!, 'Rechnung prüfen')).id;

    const ergebnis = await rendere({
      beschreibung: MIT_DATENFLUSS,
      vorherigesDiagramm: await entferneZuordnung(diagramm!, id),
    });

    expect(ergebnis.drift.istDrift).toBe(true);
    expect(ergebnis.diagramm).toBeNull();
    expect(ergebnis.drift.abweichungen[0]!.text).toMatch(/Datenzuordnungen weichen ab/);
    expect(ergebnis.drift.abweichungen[0]!.zeile).toBe(6);
  });
});
