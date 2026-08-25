import { describe, expect, it } from 'vitest';
import { rendere } from '../src/renderer.ts';
import { liesStruktur } from './struktur.ts';

/**
 * Das Glossar ist das Gedächtnis für Namen. Geprüft wird ausschließlich am Seam: was kommt
 * heraus, wenn diese Beschreibung und dieses Glossar hineingehen.
 */

/** Ein Ausschnitt in der Form der vorhandenen Glossardatei des Projekts. */
const GLOSSAR = `# camundatest

## Language

**Diagramm**:
Die aus einer Prozess-Beschreibung erzeugte \`.bpmn\`-Datei. Sie wird nicht von Hand gepflegt.
_Avoid_: BPMN (das ist der Standard, nicht die Datei), Prozessdatei
`;

const MIT_SYSTEMSCHRITT = (jobType: string) => `prozess: freigabe
ablauf:
  - system: Bestätigung senden
    job-type: ${jobType}
  - ende: Fertig
`;

const jobTypes = async (diagramm: string): Promise<(string | undefined)[]> =>
  (await liesStruktur(diagramm)).elemente
    .filter((e) => e.typ === 'bpmn:ServiceTask')
    .map((e) => e.jobType);

describe('ein unbekannter Begriff', () => {
  it('wird ohne Rückfrage nachgetragen und am Ende des Laufs berichtet', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: GLOSSAR,
    });

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(ergebnis.neueBegriffe).toEqual(['Bestätigung senden → bestaetigung-senden']);
    expect(ergebnis.glossar).not.toBeNull();
    expect(ergebnis.glossar).toContain('**Bestätigung senden**:');
    expect(ergebnis.glossar).toContain('`bestaetigung-senden`');
  });

  it('behält den vorgeschlagenen Namen im Diagramm', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: GLOSSAR,
    });
    expect(await jobTypes(ergebnis.diagramm!)).toEqual(['bestaetigung-senden']);
  });

  it('lässt alles stehen, was vorher im Glossar stand', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: GLOSSAR,
    });
    expect(ergebnis.glossar!.startsWith(GLOSSAR.trimEnd())).toBe(true);
  });

  it('taucht nur einmal auf, auch wenn zwei Schritte ihn tragen', async () => {
    const ergebnis = await rendere({
      beschreibung: `prozess: freigabe
ablauf:
  - system: Bestätigung senden
    job-type: bestaetigung-senden
  - system: Bestätigung senden
    job-type: bestaetigung-senden
  - ende: Fertig
`,
      glossar: GLOSSAR,
    });
    expect(ergebnis.neueBegriffe).toEqual(['Bestätigung senden → bestaetigung-senden']);
    expect(ergebnis.glossar!.match(/\*\*Bestätigung senden\*\*/g)).toHaveLength(1);
  });
});

describe('ein bekannter Begriff', () => {
  const bekannt = `${GLOSSAR}
**Bestätigung senden**:
Der Job-Type, unter dem ein Job Worker den Schritt „Bestätigung senden" aufgreift.
_Technischer Name_: \`bestaetigung-senden\`
`;

  it('gewinnt gegen einen abweichenden Vorschlag', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung_versenden'),
      glossar: bekannt,
    });

    expect(await jobTypes(ergebnis.diagramm!)).toEqual(['bestaetigung-senden']);
    expect(ergebnis.neueBegriffe).toEqual([]);
  });

  it('sagt, dass der Vorschlag nicht übernommen wurde', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung_versenden'),
      glossar: bekannt,
    });

    const warnung = ergebnis.pruefung.warnungen.find((w) => w.text.includes('Bestätigung senden'));
    expect(warnung?.text).toContain('bestaetigung-senden');
    expect(warnung?.text).toContain('bestaetigung_versenden');
    expect(warnung?.zeile).toBe(3);
  });

  it('schweigt, wenn der Vorschlag ohnehin derselbe ist', async () => {
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: bekannt,
    });
    expect(ergebnis.pruefung.warnungen.filter((w) => w.text.includes('Glossar'))).toEqual([]);
  });

  it('gewinnt auch, wenn er anders geschrieben angesprochen wird', async () => {
    const ergebnis = await rendere({
      beschreibung: `prozess: freigabe
ablauf:
  - system: bestätigung  senden
    job-type: irgendwas
  - ende: Fertig
`,
      glossar: bekannt,
    });
    expect(await jobTypes(ergebnis.diagramm!)).toEqual(['bestaetigung-senden']);
    expect(ergebnis.neueBegriffe).toEqual([]);
  });

  it('trägt seinen neuen Namen, sobald der Autor ihn im Glossar umbenennt', async () => {
    const umbenannt = bekannt.replace('`bestaetigung-senden`', '`benachrichtigung-senden`');
    const ergebnis = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: umbenannt,
    });

    expect(await jobTypes(ergebnis.diagramm!)).toEqual(['benachrichtigung-senden']);
    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.glossar).toBeNull();
  });
});

describe('ein Lauf ohne neue Begriffe', () => {
  it('berichtet keine und schreibt das Glossar nicht neu', async () => {
    const ergebnis = await rendere({
      beschreibung: `prozess: freigabe
ablauf:
  - mensch: Freigabe erteilen
  - ende: Fertig
`,
      glossar: GLOSSAR,
    });

    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.glossar).toBeNull();
  });
});

describe('ohne Glossar', () => {
  it('erzeugt wie beschrieben und trägt nichts nach', async () => {
    const ergebnis = await rendere({ beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden') });

    expect(await jobTypes(ergebnis.diagramm!)).toEqual(['bestaetigung-senden']);
    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.glossar).toBeNull();
  });
});

describe('das Glossar bleibt ein Glossar', () => {
  it('trägt den Namen an einen schon vorhandenen Begriff, statt ihn ein zweites Mal anzulegen', async () => {
    const ergebnis = await rendere({
      beschreibung: `prozess: freigabe
ablauf:
  - system: Diagramm
    job-type: diagramm-erzeugen
  - ende: Fertig
`,
      glossar: GLOSSAR,
    });

    expect(ergebnis.glossar!.match(/\*\*Diagramm\*\*/g)).toHaveLength(1);
    expect(ergebnis.glossar).toContain('_Avoid_: BPMN');
    expect(ergebnis.glossar).toContain('_Technischer Name_: `diagramm-erzeugen`');
  });

  it('bleibt über zwei Läufe hinweg stabil — der zweite trägt nichts mehr nach', async () => {
    const erste = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: GLOSSAR,
    });
    const zweite = await rendere({
      beschreibung: MIT_SYSTEMSCHRITT('bestaetigung-senden'),
      glossar: erste.glossar,
    });

    expect(zweite.neueBegriffe).toEqual([]);
    expect(zweite.glossar).toBeNull();
  });
});
