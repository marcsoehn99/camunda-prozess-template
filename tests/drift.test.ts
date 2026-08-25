import { describe, expect, it } from 'vitest';
import { rendere } from '../src/renderer.ts';
import { benenneProzessUm, benenneUm, fuegeAufgabeHinzu, verschiebeElement } from './struktur.ts';

/**
 * Drift-Erkennung: eine strukturelle Handänderung am Diagramm hält den Lauf an, statt
 * überschrieben zu werden (ADR 0002). Ein verschobenes Element ist nie Drift.
 *
 * Geurteilt wird über das Drift-Ergebnis des Seams, nicht über XML-Text.
 */

const FREIGABE = `prozess: freigabe
name: Freigabe
start:
  name: Antrag eingegangen
ablauf:
  - mensch: Freigabe erteilen
  - ende: Fertig
`;

/** Derselbe Prozess mit einem zusätzlichen Schritt. */
const FREIGABE_MIT_PRUEFUNG = `prozess: freigabe
name: Freigabe
start:
  name: Antrag eingegangen
ablauf:
  - mensch: Freigabe erteilen
  - system: Rechnung buchen
    job-type: rechnung-buchen
  - ende: Fertig
`;

const TASK = 'Task_FreigabeErteilen';

async function erzeuge(beschreibung: string, vorherigesDiagramm?: string | null) {
  const ergebnis = await rendere({
    beschreibung,
    ...(vorherigesDiagramm === undefined ? {} : { vorherigesDiagramm }),
  });
  expect(ergebnis.pruefung.fehler).toEqual([]);
  expect(ergebnis.diagramm).not.toBeNull();
  return ergebnis.diagramm!;
}

const texte = (meldungen: { text: string }[]): string => meldungen.map((m) => m.text).join('\n');

describe('Drift-Erkennung', () => {
  it('läuft ohne vorheriges Diagramm durch', async () => {
    const ergebnis = await rendere({ beschreibung: FREIGABE });
    expect(ergebnis.drift).toEqual({ istDrift: false, abweichungen: [] });
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('sieht kein Drift in einem unverändert vorgefundenen Diagramm', async () => {
    const erst = await erzeuge(FREIGABE);
    const ergebnis = await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: erst });
    expect(ergebnis.drift.istDrift).toBe(false);
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('sieht kein Drift in einem bloß verschobenen Element', async () => {
    const erst = await erzeuge(FREIGABE);
    const verschoben = await verschiebeElement(erst, TASK, 0, 240);

    const ergebnis = await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: verschoben });
    expect(ergebnis.drift.istDrift).toBe(false);
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('sieht kein Drift, wenn nur die Prozess-Beschreibung gewachsen ist', async () => {
    const erst = await erzeuge(FREIGABE);
    const ergebnis = await rendere({ beschreibung: FREIGABE_MIT_PRUEFUNG, vorherigesDiagramm: erst });
    expect(ergebnis.drift.istDrift).toBe(false);
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('hält an und schreibt nichts, wenn von Hand ein Element dazukam', async () => {
    const erst = await erzeuge(FREIGABE);
    const bemalt = await fuegeAufgabeHinzu(erst, 'Activity_0handarbeit', 'Von Hand danebengemalt');

    const ergebnis = await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: bemalt });
    expect(ergebnis.drift.istDrift).toBe(true);
    expect(ergebnis.diagramm).toBeNull();
    expect(texte(ergebnis.drift.abweichungen)).toContain('Von Hand danebengemalt');
    expect(texte(ergebnis.drift.abweichungen)).toContain('Activity_0handarbeit');
  });

  it('benennt bei einer Umbenennung beide Namen und zeigt auf die Zeile der Beschreibung', async () => {
    const erst = await erzeuge(FREIGABE);
    const umbenannt = await benenneUm(erst, TASK, 'Freigabe im Vieraugenprinzip');

    const ergebnis = await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: umbenannt });
    expect(ergebnis.drift.istDrift).toBe(true);
    const meldung = ergebnis.drift.abweichungen.find((m) => m.text.includes(TASK));
    expect(meldung?.text).toContain('Freigabe im Vieraugenprinzip');
    expect(meldung?.text).toContain('Freigabe erteilen');
    expect(meldung?.zeile).toBe(6);
  });

  it('läuft wieder durch, sobald die Handänderung in der Beschreibung steht — Übernehmen', async () => {
    const erst = await erzeuge(FREIGABE);
    const umbenannt = await benenneProzessUm(erst, 'Rechnungsfreigabe');
    expect((await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: umbenannt })).drift.istDrift).toBe(true);

    // Der Autor schreibt die Handänderung in die Prozess-Beschreibung nach. Danach sagen
    // Diagramm und Beschreibung dasselbe — es gibt nichts mehr zu verlieren, also kein Drift.
    const ergebnis = await rendere({
      beschreibung: FREIGABE.replace('name: Freigabe', 'name: Rechnungsfreigabe'),
      vorherigesDiagramm: umbenannt,
    });
    expect(ergebnis.drift).toEqual({ istDrift: false, abweichungen: [] });
    expect(ergebnis.diagramm).not.toBeNull();
  });

  it('erzeugt trotz Handänderung, wenn sie ausdrücklich verworfen wird', async () => {
    const erst = await erzeuge(FREIGABE);
    const bemalt = await fuegeAufgabeHinzu(erst, 'Activity_0handarbeit', 'Von Hand danebengemalt');

    const ergebnis = await rendere({
      beschreibung: FREIGABE,
      vorherigesDiagramm: bemalt,
      driftVerwerfen: true,
    });
    expect(ergebnis.drift.istDrift).toBe(false);
    expect(ergebnis.diagramm).not.toBeNull();
    expect(ergebnis.diagramm).not.toContain('Activity_0handarbeit');
  });

  it('warnt statt anzuhalten, wenn das vorhandene Diagramm keine Signatur trägt', async () => {
    const erst = await erzeuge(FREIGABE);
    const ohneSignatur = erst.replace(/ prozess:signatur="[^"]*"/, '');
    expect(ohneSignatur).not.toContain('prozess:signatur');

    const ergebnis = await rendere({ beschreibung: FREIGABE, vorherigesDiagramm: ohneSignatur });
    expect(ergebnis.drift.istDrift).toBe(false);
    expect(ergebnis.diagramm).not.toBeNull();
    expect(texte(ergebnis.pruefung.warnungen)).toContain('keine Signatur');
  });
});
