import { describe, expect, it } from 'vitest';
import { pruefeDiagramm } from '../src/pruefung.ts';
import { rendere } from '../src/renderer.ts';
import { entferneStandardpfad, fuegeAufgabeHinzu, liesStruktur } from './struktur.ts';

/**
 * Die Lücke unter dem Kompatibilitätslinter: die Bedeutung eines FEEL-Ausdrucks, die Herkunft
 * einer benutzten Variable, und die zwei Sackgassen, die kein Linter meldet.
 */

/** Ein Ausschnitt in der Form der vorhandenen Glossardatei des Projekts. */
const GLOSSAR = `# camundatest

## Language

**Diagramm**:
Die aus einer Prozess-Beschreibung erzeugte \`.bpmn\`-Datei. Sie wird nicht von Hand gepflegt.
`;

/** Zehn Urlaubstage, entschieden an einer Variablen, die es auch wirklich gibt. */
const URLAUB = `prozess: urlaub
start:
  name: Antrag eingegangen
  eingang: [Urlaubstage]
ablauf:
  - frage: Mehr als zehn Tage?
    wenn: =urlaubstage > 10
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Bestätigen
  - ende: Antrag bearbeitet
`;

const texte = (meldungen: { text: string }[]): string[] => meldungen.map((m) => m.text);

const passend = (meldungen: { text: string; zeile?: number }[], muster: RegExp) =>
  meldungen.filter((m) => muster.test(m.text));

describe('ein FEEL-Ausdruck, der sich nicht lesen lässt', () => {
  it('wird gemeldet, und es entsteht kein Diagramm', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=urlaubstage >'),
    });

    expect(ergebnis.diagramm).toBeNull();
    expect(ergebnis.pruefung.fehler).toEqual([
      { text: '`=urlaubstage >` ist kein FEEL-Ausdruck, der sich lesen lässt.', zeile: 7 },
    ]);
  });

  it('wird genau einmal gemeldet, nicht noch einmal aus dem Linter', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=urlaubstage >'),
    });

    expect(ergebnis.pruefung.fehler).toHaveLength(1);
  });

  it('hält auch den Rest des Laufs an: kein Glossar wächst an einem kaputten Prozess', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=1 +'),
      glossar: GLOSSAR,
    });

    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.glossar).toBeNull();
  });
});

describe('ein Ausdruck über eine Variable, die nirgends herkommt', () => {
  it('wird gemeldet und zeigt auf die Zeile in der Prozess-Beschreibung', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=tage > 10'),
    });

    const gemeldet = passend(ergebnis.pruefung.warnungen, /benutzt `tage`/);
    expect(gemeldet).toHaveLength(1);
    expect(gemeldet[0]!.zeile).toBe(7);
    expect(gemeldet[0]!.text).toContain('Bekannt sind: urlaubstage');
  });

  it('hält den Lauf nicht an — ein Schritt ohne `erzeugt:` gibt zurück, was sein Worker zurückgibt', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=tage > 10'),
    });

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('bleibt aus, wenn ein Schritt die Variable erzeugt', async () => {
    const ergebnis = await rendere({
      beschreibung: `prozess: p
ablauf:
  - system: Rechnung prüfen
    job-type: rechnung-pruefen
    erzeugt: Abweichung
  - frage: Gibt es eine Abweichung?
    wenn: =abweichung
    dann:
      - mensch: Abweichung klären
  - ende: Fertig
`,
    });

    expect(passend(ergebnis.pruefung.warnungen, /benutzt/)).toEqual([]);
  });

  it('hält eine eingebaute FEEL-Funktion nicht für eine Variable', async () => {
    const ergebnis = await rendere({
      beschreibung: URLAUB.replace('=urlaubstage > 10', '=not(string length(urlaubstage) > 10)'),
    });

    expect(passend(ergebnis.pruefung.warnungen, /benutzt/)).toEqual([]);
  });

  it('meldet den alten Namen, sobald das Glossar die Variable umbenennt', async () => {
    const beschreibung = `prozess: p
start:
  eingang: [Urlaubstage]
ablauf:
  - frage: Mehr als zehn Tage?
    wenn: =urlaubstage > 10
    dann:
      - mensch: Freigabe
  - ende: Fertig
`;
    const erste = await rendere({ beschreibung, glossar: GLOSSAR });
    const umbenannt = erste.glossar!.replace(
      '_Variablenname_: `urlaubstage`',
      '_Variablenname_: `tageUrlaub`',
    );

    const zweite = await rendere({ beschreibung, glossar: umbenannt });

    expect(passend(erste.pruefung.warnungen, /benutzt/)).toEqual([]);
    expect(texte(passend(zweite.pruefung.warnungen, /benutzt/))).toEqual([
      'Der Ausdruck `=urlaubstage > 10` benutzt `urlaubstage`. Diese Variable kommt weder unter ' +
        '`eingang:` herein noch erzeugt sie ein Schritt. Bekannt sind: tageUrlaub.',
    ]);
  });
});

describe('eine Verzweigung ohne Standardpfad', () => {
  it('wird gemeldet und zeigt auf die Stelle in der Prozess-Beschreibung', async () => {
    const { diagramm } = await rendere({ beschreibung: URLAUB });
    const gateway = (await liesStruktur(diagramm!)).elemente.find(
      (e) => e.name === 'Mehr als zehn Tage?',
    )!;

    const pruefung = await pruefeDiagramm(
      await entferneStandardpfad(diagramm!, gateway.id),
      new Map([[gateway.id, 6]]),
    );

    const gemeldet = passend(pruefung.warnungen, /Standardpfad/);
    expect(texte(gemeldet)).toEqual([
      `Verzweigung „Mehr als zehn Tage?" (${gateway.id}) hat keinen Standardpfad: ` +
        'trifft keine Bedingung zu, bleibt der Prozess dort stehen.',
    ]);
    expect(gemeldet[0]!.zeile).toBe(6);
  });

  it('gilt nicht für eine Zusammenführung — sie hat nur einen Ausgang', async () => {
    const { diagramm, pruefung } = await rendere({ beschreibung: URLAUB });
    const zusammen = (await liesStruktur(diagramm!)).elemente.find(
      (e) => e.typ === 'bpmn:ExclusiveGateway' && e.name === undefined,
    );

    expect(zusammen).toBeDefined();
    expect(passend(pruefung.warnungen, /Standardpfad/)).toEqual([]);
  });
});

describe('ein Element, das kein Pfad erreicht', () => {
  it('wird gemeldet', async () => {
    const { diagramm } = await rendere({ beschreibung: URLAUB });

    const pruefung = await pruefeDiagramm(
      await fuegeAufgabeHinzu(diagramm!, 'Task_Danebengemalt', 'Danebengemalt'),
      new Map(),
    );

    expect(texte(passend(pruefung.warnungen, /erreichbar/))).toEqual([
      'Schritt für Menschen „Danebengemalt" (Task_Danebengemalt) ist von keinem Startereignis aus erreichbar.',
    ]);
  });
});

describe('ein Prozess, an dem nichts auszusetzen ist', () => {
  it('erzeugt keine dieser Meldungen', async () => {
    const ergebnis = await rendere({ beschreibung: URLAUB });

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(texte(ergebnis.pruefung.warnungen).filter((t) => /FEEL|benutzt|Standardpfad|erreichbar/.test(t))).toEqual([]);
  });
});
