import { neuesModdle } from './moddle.ts';

/**
 * Layout-Übernahme (ADR 0002): Struktur gehört der Prozess-Beschreibung, Layout gehört dem
 * Autor. Was er im Desktop Modeler verschoben hat, bleibt liegen; nur was neu dazukommt,
 * wird platziert.
 *
 * Hier steht nichts über Struktur — nur Kästen und Kantenverläufe.
 */

export type Kasten = { x: number; y: number; width: number; height: number };
export type Punkt = { x: number; y: number };

export type Layout = {
  formen: Map<string, Kasten>;
  kanten: Map<string, Punkt[]>;
  /** Fluss-ID → seine beiden Enden. Ein Verlauf wird nur übernommen, wenn er dieselben verbindet. */
  enden: Map<string, { von: string; nach: string }>;
};

/** Abstand, den automatisch platzierte Elemente zu allem Vorhandenen halten. */
const ABSTAND = 60;

/** Ab wann zwei Mitten als „auf einer Linie" gelten und die Kante gerade laufen darf. */
const AUF_LINIE = 6;

const mitte = (k: Kasten): Punkt => ({ x: k.x + k.width / 2, y: k.y + k.height / 2 });

const ueberlappen = (a: Kasten, b: Kasten): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const mitRand = (k: Kasten): Kasten => ({
  x: k.x - ABSTAND / 2,
  y: k.y - ABSTAND / 2,
  width: k.width + ABSTAND,
  height: k.height + ABSTAND,
});

/**
 * Liest das Layout eines vorhandenen Diagramms.
 *
 * `null` heißt: daraus ist nichts zu übernehmen — die Datei ist kein lesbares Diagramm oder
 * trägt kein Layout. Der Aufrufer rechnet dann neu, statt den Lauf zu verlieren.
 */
export async function liesLayout(diagramm: string): Promise<Layout | null> {
  let rootElement: any;
  try {
    ({ rootElement } = (await neuesModdle().fromXML(diagramm)) as any);
  } catch {
    return null;
  }
  if (rootElement?.$type !== 'bpmn:Definitions') return null;

  const plane = rootElement.get('diagrams')?.[0]?.plane;
  if (!plane) return null;

  const formen = new Map<string, Kasten>();
  const kanten = new Map<string, Punkt[]>();
  for (const di of plane.get('planeElement') ?? []) {
    const id = di.bpmnElement?.id;
    if (!id) continue;
    if (di.$type === 'bpmndi:BPMNShape' && di.bounds) {
      formen.set(id, { x: di.bounds.x, y: di.bounds.y, width: di.bounds.width, height: di.bounds.height });
    } else if (di.$type === 'bpmndi:BPMNEdge' && (di.waypoint?.length ?? 0) >= 2) {
      kanten.set(id, di.waypoint.map((w: any) => ({ x: w.x, y: w.y })));
    }
  }
  if (formen.size === 0) return null;

  const enden = new Map<string, { von: string; nach: string }>();
  for (const wurzel of rootElement.get('rootElements') ?? []) {
    if (wurzel.$type !== 'bpmn:Process') continue;
    for (const element of wurzel.get('flowElements') ?? []) {
      if (element.$type === 'bpmn:SequenceFlow' && element.sourceRef && element.targetRef) {
        enden.set(element.id, { von: element.sourceRef.id, nach: element.targetRef.id });
      }
    }
  }

  return { formen, kanten, enden };
}

/**
 * Legt das Layout des vorherigen Diagramms über ein frisch erzeugtes.
 *
 * Elemente, die es vorher schon gab, bekommen ihre alte Position zurück. Neue werden zwischen
 * ihre bereits platzierten Nachbarn gesetzt und so weit nach unten geschoben, bis sie nichts
 * mehr überdecken. Kanten, deren Enden beide unverändert liegen, behalten ihren Verlauf; alle
 * anderen werden neu geführt.
 *
 * Erkennt es kein einziges Element wieder, bleibt das frische Diagramm, wie es ist.
 */
export async function uebernimmLayout(diagramm: string, vorher: Layout): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(diagramm)) as any;

  const formen = new Map<string, any>();
  const kanten = new Map<string, any>();
  for (const di of rootElement.get('diagrams')[0].plane.get('planeElement')) {
    const id = di.bpmnElement?.id;
    if (!id) continue;
    if (di.$type === 'bpmndi:BPMNShape') formen.set(id, di);
    else if (di.$type === 'bpmndi:BPMNEdge') kanten.set(id, di);
  }
  if (![...formen.keys()].some((id) => vorher.formen.has(id))) return diagramm;

  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  const fluesse = (prozess.get('flowElements') as any[])
    .filter((e) => e.$type === 'bpmn:SequenceFlow')
    .map((e) => ({ id: e.id as string, von: e.sourceRef.id as string, nach: e.targetRef.id as string }));

  const position = bestimmePositionen(formen, fluesse, vorher);

  for (const [id, ziel] of position) {
    const di = formen.get(id);
    const verschiebung = { x: ziel.x - di.bounds.x, y: ziel.y - di.bounds.y };
    di.bounds.x = ziel.x;
    di.bounds.y = ziel.y;
    if (di.label?.bounds) {
      di.label.bounds.x += verschiebung.x;
      di.label.bounds.y += verschiebung.y;
    }
  }

  for (const fluss of fluesse) {
    const di = kanten.get(fluss.id);
    if (!di) continue;

    const alt = vorher.kanten.get(fluss.id);
    const alteEnden = vorher.enden.get(fluss.id);
    const unveraendert =
      alt !== undefined &&
      alteEnden?.von === fluss.von &&
      alteEnden?.nach === fluss.nach &&
      vorher.formen.has(fluss.von) &&
      vorher.formen.has(fluss.nach);

    const punkte = unveraendert
      ? alt
      : verlauf(position.get(fluss.von)!, position.get(fluss.nach)!);
    di.waypoint = punkte.map((p) => moddle.create('dc:Point', { x: Math.round(p.x), y: Math.round(p.y) }));

    if (!unveraendert && di.label?.bounds) {
      const knick = punkte[Math.floor(punkte.length / 2)]!;
      di.label.bounds.x = Math.round(knick.x);
      di.label.bounds.y = Math.round(knick.y) - di.label.bounds.height;
    }
  }

  const { xml } = await moddle.toXML(rootElement, { format: true });
  return xml;
}

/**
 * Übernommene Positionen zuerst, danach die neuen Elemente in mehreren Durchgängen — jedes,
 * sobald einer seiner Nachbarn liegt. Wer nach dem letzten Durchgang keinen Nachbarn hat,
 * kommt unter alles Vorhandene.
 */
function bestimmePositionen(
  formen: Map<string, any>,
  fluesse: { von: string; nach: string }[],
  vorher: Layout,
): Map<string, Kasten> {
  const position = new Map<string, Kasten>();
  for (const [id, di] of formen) {
    const alt = vorher.formen.get(id);
    if (alt) position.set(id, { x: alt.x, y: alt.y, width: di.bounds.width, height: di.bounds.height });
  }

  let offen = [...formen.keys()].filter((id) => !position.has(id));
  while (offen.length > 0) {
    const rest: string[] = [];
    for (const id of offen) {
      const kasten = anNachbarn(id, formen.get(id).bounds, position, fluesse);
      if (kasten === null) rest.push(id);
      else position.set(id, entzerre(kasten, position));
    }
    if (rest.length === offen.length) {
      for (const id of rest) {
        const { width, height } = formen.get(id).bounds;
        const kaesten = [...position.values()];
        position.set(
          id,
          entzerre(
            {
              x: Math.min(...kaesten.map((k) => k.x)),
              y: Math.max(...kaesten.map((k) => k.y + k.height)) + ABSTAND,
              width,
              height,
            },
            position,
          ),
        );
      }
      break;
    }
    offen = rest;
  }

  return position;
}

/** Setzt ein neues Element zwischen seine bereits platzierten Nachbarn. */
function anNachbarn(
  id: string,
  groesse: { width: number; height: number },
  position: Map<string, Kasten>,
  fluesse: { von: string; nach: string }[],
): Kasten | null {
  const { width, height } = groesse;
  const vorgaenger = fluesse.filter((f) => f.nach === id).map((f) => position.get(f.von)).find(Boolean);
  const nachfolger = fluesse.filter((f) => f.von === id).map((f) => position.get(f.nach)).find(Boolean);

  if (vorgaenger && nachfolger) {
    const a = mitte(vorgaenger);
    const b = mitte(nachfolger);
    return {
      x: Math.round((a.x + b.x) / 2 - width / 2),
      y: Math.round((a.y + b.y) / 2 - height / 2),
      width,
      height,
    };
  }
  if (vorgaenger) {
    return {
      x: vorgaenger.x + vorgaenger.width + ABSTAND,
      y: Math.round(mitte(vorgaenger).y - height / 2),
      width,
      height,
    };
  }
  if (nachfolger) {
    return {
      x: nachfolger.x - ABSTAND - width,
      y: Math.round(mitte(nachfolger).y - height / 2),
      width,
      height,
    };
  }
  return null;
}

/** Schiebt einen Kasten nach unten, bis er nichts Vorhandenes mehr überdeckt. */
function entzerre(kasten: Kasten, belegt: Map<string, Kasten>): Kasten {
  let ergebnis = kasten;
  for (let versuch = 0; versuch < 100; versuch += 1) {
    const stoerer = [...belegt.values()].find((b) => ueberlappen(mitRand(ergebnis), b));
    if (stoerer === undefined) return ergebnis;
    ergebnis = { ...ergebnis, y: stoerer.y + stoerer.height + ABSTAND };
  }
  return ergebnis;
}

/**
 * Führt eine Kante rechtwinklig von Kasten zu Kasten. Die Enden docken auf dem Rand an,
 * damit keine Kante ins Leere läuft — auch dann nicht, wenn der Autor ein Element quer
 * über das Bild gezogen hat.
 */
function verlauf(von: Kasten, nach: Kasten): Punkt[] {
  const a = mitte(von);
  const b = mitte(nach);

  if (nach.x >= von.x + von.width) {
    if (Math.abs(a.y - b.y) < AUF_LINIE) {
      return [{ x: von.x + von.width, y: a.y }, { x: nach.x, y: a.y }];
    }
    const knickX = Math.round((von.x + von.width + nach.x) / 2);
    return [
      { x: von.x + von.width, y: a.y },
      { x: knickX, y: a.y },
      { x: knickX, y: b.y },
      { x: nach.x, y: b.y },
    ];
  }

  // Rücksprung: unten herum, damit die Kante nicht durch die Elemente dazwischen läuft.
  if (von.x >= nach.x + nach.width) {
    const knickY = Math.max(von.y + von.height, nach.y + nach.height) + ABSTAND;
    return [
      { x: a.x, y: von.y + von.height },
      { x: a.x, y: knickY },
      { x: b.x, y: knickY },
      { x: b.x, y: nach.y + nach.height },
    ];
  }

  const abwaerts = b.y >= a.y;
  const vonY = abwaerts ? von.y + von.height : von.y;
  const nachY = abwaerts ? nach.y : nach.y + nach.height;
  if (Math.abs(a.x - b.x) < AUF_LINIE) return [{ x: a.x, y: vonY }, { x: a.x, y: nachY }];

  const knickY = Math.round((vonY + nachY) / 2);
  return [
    { x: a.x, y: vonY },
    { x: a.x, y: knickY },
    { x: b.x, y: knickY },
    { x: b.x, y: nachY },
  ];
}
