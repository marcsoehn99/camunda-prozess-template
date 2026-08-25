import { describe, expect, it } from 'vitest';
import { rendere } from '../src/renderer.ts';
import {
  liesStruktur,
  ueberlappendePaare,
  verschiebeElement,
  type Kasten,
  type Struktur,
} from './struktur.ts';

/**
 * Layout-Übernahme: Struktur gehört der Prozess-Beschreibung, Layout gehört dem Autor
 * (ADR 0002). Hier wird ausschließlich über Positionen geurteilt — das ist die eine Stelle,
 * an der die Position die Zusicherung ist.
 */

const OHNE_ESKALATION = `prozess: freigabe
name: Freigabe
start:
  name: Antrag eingegangen
ablauf:
  - mensch: Freigabe erteilen
  - ende: Fertig
`;

/** Derselbe Prozess mit einem zusätzlichen Schritt zwischen Freigabe und Ende. */
const MIT_ESKALATION = `prozess: freigabe
name: Freigabe
start:
  name: Antrag eingegangen
ablauf:
  - mensch: Freigabe erteilen
  - system: Antragsteller benachrichtigen
    job-type: benachrichtigen
  - ende: Fertig
`;

const TASK = 'Task_FreigabeErteilen';
const NEUER_TASK = 'Task_AntragstellerBenachrichtigen';

async function erzeuge(
  beschreibung: string,
  vorherigesDiagramm?: string | null,
  layoutNeuBerechnen?: boolean,
) {
  const ergebnis = await rendere({
    beschreibung,
    ...(vorherigesDiagramm === undefined ? {} : { vorherigesDiagramm }),
    ...(layoutNeuBerechnen ? { layoutNeuBerechnen } : {}),
  });
  expect(ergebnis.pruefung.fehler).toEqual([]);
  expect(ergebnis.diagramm).not.toBeNull();
  return ergebnis.diagramm!;
}

const kasten = (s: Struktur, id: string): Kasten => {
  const form = s.formen.get(id);
  expect(form, `${id} hat keine Form`).toBeDefined();
  return form!;
};

/** Findet den Fluss zwischen zwei Elementen über deren IDs. */
const flussId = (s: Struktur, von: string, nach: string): string => {
  const fluss = s.fluesse.find((f) => f.von === von && f.nach === nach);
  expect(fluss, `kein Fluss ${von} → ${nach}`).toBeDefined();
  return fluss!.id;
};

/** Liegt der Punkt auf dem Rand des Kastens (mit etwas Toleranz)? */
function liegtAmRand(punkt: { x: number; y: number }, k: Kasten): boolean {
  const t = 2;
  const imX = punkt.x >= k.x - t && punkt.x <= k.x + k.width + t;
  const imY = punkt.y >= k.y - t && punkt.y <= k.y + k.height + t;
  const amSenkrechten = Math.abs(punkt.x - k.x) <= t || Math.abs(punkt.x - (k.x + k.width)) <= t;
  const amWaagerechten = Math.abs(punkt.y - k.y) <= t || Math.abs(punkt.y - (k.y + k.height)) <= t;
  return (imX && imY) && (amSenkrechten || amWaagerechten);
}

describe('Layout-Übernahme', () => {
  it('behält die Position eines im Modeler verschobenen Elements', async () => {
    const erst = await erzeuge(OHNE_ESKALATION);
    const verschoben = await verschiebeElement(erst, TASK, 0, 240);

    const zweit = await erzeuge(OHNE_ESKALATION, verschoben);

    const vorher = await liesStruktur(verschoben);
    const nachher = await liesStruktur(zweit);
    expect(kasten(nachher, TASK)).toEqual(kasten(vorher, TASK));
  });

  it('lässt auch alle übrigen Elemente liegen, wo sie lagen', async () => {
    const erst = await erzeuge(OHNE_ESKALATION);
    const verschoben = await verschiebeElement(erst, TASK, -80, 240);

    const nachher = await liesStruktur(await erzeuge(OHNE_ESKALATION, verschoben));
    const vorher = await liesStruktur(verschoben);

    for (const [id, form] of vorher.formen) {
      expect(nachher.formen.get(id), `${id} ist gewandert`).toEqual(form);
    }
  });

  it('platziert nur neu hinzugekommene Elemente und überlappt dabei nichts', async () => {
    const verschoben = await verschiebeElement(await erzeuge(OHNE_ESKALATION), TASK, 0, 160);
    const vorher = await liesStruktur(verschoben);

    const nachher = await liesStruktur(await erzeuge(MIT_ESKALATION, verschoben));

    for (const [id, form] of vorher.formen) {
      expect(nachher.formen.get(id), `${id} ist gewandert`).toEqual(form);
    }
    expect(nachher.formen.has(NEUER_TASK)).toBe(true);
    expect(ueberlappendePaare(nachher)).toEqual([]);
  });

  it('entfernt verschwundene Elemente samt ihrer Kanten, ohne Reste zu hinterlassen', async () => {
    const vorher = await erzeuge(MIT_ESKALATION);
    const nachher = await erzeuge(OHNE_ESKALATION, vorher);

    expect(nachher).not.toContain(NEUER_TASK);

    const s = await liesStruktur(nachher);
    expect(s.elemente.map((e) => e.id)).toEqual([...s.formen.keys()]);
    expect(s.fluesse.map((f) => f.id).sort()).toEqual([...s.kanten.keys()].sort());
    expect(s.warnungen).toEqual([]);
  });

  it('lässt den Kantenverlauf zwischen unverändert übernommenen Elementen genau so, wie er war', async () => {
    const erst = await erzeuge(OHNE_ESKALATION);
    const zweit = await erzeuge(OHNE_ESKALATION, erst);

    const vorher = await liesStruktur(erst);
    const nachher = await liesStruktur(zweit);
    for (const [id, punkte] of vorher.kanten) {
      expect(nachher.kanten.get(id), `Kante ${id} hat sich verzogen`).toEqual(punkte);
    }
  });

  it('behält den Verlauf, den der Autor im Modeler selbst gezogen hat', async () => {
    const verschoben = await verschiebeElement(await erzeuge(OHNE_ESKALATION), TASK, 0, 240);
    const vorher = await liesStruktur(verschoben);
    const nachher = await liesStruktur(await erzeuge(OHNE_ESKALATION, verschoben));

    for (const [id, punkte] of vorher.kanten) {
      expect(nachher.kanten.get(id), `Kante ${id} wurde neu gelegt`).toEqual(punkte);
    }
  });

  it('führt die Kanten eines neuen Elements an beide Ränder heran, statt sie ins Leere laufen zu lassen', async () => {
    const verschoben = await verschiebeElement(await erzeuge(OHNE_ESKALATION), TASK, 0, 240);
    const s = await liesStruktur(await erzeuge(MIT_ESKALATION, verschoben));
    const ende = s.elemente.find((e) => e.typ === 'bpmn:EndEvent')!;

    for (const [von, nach] of [[TASK, NEUER_TASK], [NEUER_TASK, ende.id]] as const) {
      const punkte = s.kanten.get(flussId(s, von, nach))!;
      expect(punkte.length).toBeGreaterThanOrEqual(2);
      expect(liegtAmRand(punkte[0]!, kasten(s, von)), `${von} → ${nach} startet nicht am Rand`).toBe(true);
      expect(liegtAmRand(punkte.at(-1)!, kasten(s, nach)), `${von} → ${nach} endet nicht am Rand`).toBe(true);
    }
  });

  it('behält die Ziel-Ausführungsplattform, wenn ein Layout übernommen wird', async () => {
    const erst = await erzeuge(OHNE_ESKALATION);
    const s = await liesStruktur(await erzeuge(OHNE_ESKALATION, await verschiebeElement(erst, TASK, 0, 100)));
    expect(s.plattform).toBe('Camunda Cloud');
    expect(s.plattformVersion).toBe('8.9.0');
  });
});

describe('Layout neu berechnen', () => {
  it('wirft auf ausdrücklichen Wunsch alle übernommenen Positionen weg', async () => {
    const frisch = await liesStruktur(await erzeuge(OHNE_ESKALATION));
    const verschoben = await verschiebeElement(await erzeuge(OHNE_ESKALATION), TASK, 0, 240);

    const s = await liesStruktur(await erzeuge(OHNE_ESKALATION, verschoben, true));
    expect(kasten(s, TASK)).toEqual(kasten(frisch, TASK));
  });
});

describe('ohne vorheriges Diagramm', () => {
  it('erzeugt weiterhin Zeichen für Zeichen dasselbe wie ohne Layout-Übernahme', async () => {
    expect(await erzeuge(OHNE_ESKALATION)).toEqual(await erzeuge(OHNE_ESKALATION, null));
  });

  it('meldet ein unlesbares vorheriges Diagramm als Warnung, statt den Lauf zu verlieren', async () => {
    const ergebnis = await rendere({ beschreibung: OHNE_ESKALATION, vorherigesDiagramm: '<egal/>' });

    expect(ergebnis.pruefung.fehler).toEqual([]);
    expect(ergebnis.diagramm).not.toBeNull();
    expect(ergebnis.pruefung.warnungen.map((w) => w.text)).toContainEqual(
      expect.stringMatching(/vorherige Diagramm/),
    );
  });
});

/**
 * Verzweigte Prozesse tragen Knoten, die in der Beschreibung nirgends stehen — die
 * zusammenführenden Gateways. Auch die müssen über Runden liegen bleiben.
 */
describe('Layout-Übernahme bei einer Verzweigung', () => {
  const OHNE_EILFALL = `prozess: urlaub
ablauf:
  - frage: Mehr als zehn Tage?
    wenn: =tage > 10
    dann:
      - mensch: Freigabe Geschäftsführung
    sonst:
      - mensch: Bestätigen
  - ende: Fertig
`;

  const MIT_EILFALL = OHNE_EILFALL.replace(
    '  - ende: Fertig',
    '  - system: Antragsteller benachrichtigen\n    job-type: benachrichtigen\n  - ende: Fertig',
  );

  it('hält auch das zusammenführende Gateway an seinem Platz und platziert nur den neuen Schritt', async () => {
    const verschoben = await verschiebeElement(
      await erzeuge(OHNE_EILFALL),
      'Zusammenfuehrung_MehrAlsZehnTage',
      40,
      120,
    );
    const vorher = await liesStruktur(verschoben);

    const nachher = await liesStruktur(await erzeuge(MIT_EILFALL, verschoben));

    for (const [id, form] of vorher.formen) {
      expect(nachher.formen.get(id), `${id} ist gewandert`).toEqual(form);
    }
    expect(nachher.formen.has(NEUER_TASK)).toBe(true);
    expect(ueberlappendePaare(nachher)).toEqual([]);
  });
});
