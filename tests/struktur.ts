import { neuesModdle } from '../src/moddle.ts';

/**
 * Liest ein erzeugtes Diagramm ein und macht seine Struktur prüfbar.
 *
 * Tests urteilen über diese Struktur, nie über den XML-Text als Ganzes: Koordinaten und
 * Kantenverläufe verschieben sich mit jeder Layout-Änderung.
 */

export type Kasten = { x: number; y: number; width: number; height: number };

export type Element = {
  id: string;
  typ: string;
  name?: string;
  istCamundaUserTask: boolean;
  /** Job-Type eines Service Tasks, sofern gesetzt. */
  jobType?: string;
  /** ID des Standardpfads eines Gateways, sofern gesetzt. */
  standardFluss?: string;
  /** Ausgabe-Zuordnungen als „source → target". Leer, wenn das Element keine trägt. */
  ausgaben: [string, string][];
};

export type Fluss = { id: string; von: string; nach: string; name?: string; bedingung?: string };

export type Struktur = {
  prozessId: string;
  prozessName?: string;
  plattform?: string;
  plattformVersion?: string;
  elemente: Element[];
  fluesse: Fluss[];
  formen: Map<string, Kasten>;
  kanten: Map<string, { x: number; y: number }[]>;
  warnungen: unknown[];
};

export async function liesStruktur(xml: string): Promise<Struktur> {
  const moddle = neuesModdle();
  const { rootElement, warnings } = (await moddle.fromXML(xml)) as any;

  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  const flowElements = prozess.get('flowElements') as any[];

  const erweiterungen = (e: any): any[] => e.get('extensionElements')?.get('values') ?? [];

  const elemente: Element[] = flowElements
    .filter((e) => e.$type !== 'bpmn:SequenceFlow')
    .map((e) => {
      const aufgabe = erweiterungen(e).find((v: any) => v.$type === 'zeebe:TaskDefinition');
      const zuordnung = erweiterungen(e).find((v: any) => v.$type === 'zeebe:IoMapping');
      return {
        id: e.id as string,
        typ: e.$type as string,
        name: e.name as string | undefined,
        istCamundaUserTask: erweiterungen(e).some((v: any) => v.$type === 'zeebe:UserTask'),
        ...(aufgabe ? { jobType: aufgabe.type as string } : {}),
        ...(e.default ? { standardFluss: e.default.id as string } : {}),
        ausgaben: ((zuordnung?.get('outputParameters') ?? []) as any[]).map(
          (p) => [p.source, p.target] as [string, string],
        ),
      };
    });

  const fluesse: Fluss[] = flowElements
    .filter((e) => e.$type === 'bpmn:SequenceFlow')
    .map((e) => ({
      id: e.id as string,
      von: e.sourceRef.id as string,
      nach: e.targetRef.id as string,
      ...(e.name ? { name: e.name as string } : {}),
      ...(e.conditionExpression ? { bedingung: e.conditionExpression.body as string } : {}),
    }));

  const formen = new Map<string, Kasten>();
  const kanten = new Map<string, { x: number; y: number }[]>();
  const diagramm = rootElement.get('diagrams')[0];
  for (const di of diagramm?.plane?.get('planeElement') ?? []) {
    const id = di.bpmnElement?.id;
    if (!id) continue;
    if (di.$type === 'bpmndi:BPMNShape') {
      formen.set(id, { x: di.bounds.x, y: di.bounds.y, width: di.bounds.width, height: di.bounds.height });
    } else if (di.$type === 'bpmndi:BPMNEdge') {
      kanten.set(id, di.waypoint.map((w: any) => ({ x: w.x, y: w.y })));
    }
  }

  return {
    prozessId: prozess.id,
    prozessName: prozess.name,
    plattform: rootElement.get('modeler:executionPlatform'),
    plattformVersion: rootElement.get('modeler:executionPlatformVersion'),
    elemente,
    fluesse,
    formen,
    kanten,
    warnungen: warnings,
  };
}

export function ueberlappen(a: Kasten, b: Kasten): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Nennt jedes Paar aus Elementen, deren Kästen sich überdecken. Leer heißt: das Bild ist lesbar.
 */
export function ueberlappendePaare(struktur: Struktur): string[] {
  const kaesten = [...struktur.formen.entries()];
  const treffer: string[] = [];
  for (let i = 0; i < kaesten.length; i += 1) {
    for (let j = i + 1; j < kaesten.length; j += 1) {
      if (ueberlappen(kaesten[i]![1], kaesten[j]![1])) treffer.push(`${kaesten[i]![0]} / ${kaesten[j]![0]}`);
    }
  }
  return treffer;
}

/**
 * Nennt jede Kante, die durch ein Element läuft, das weder ihre Quelle noch ihr Ziel ist.
 * Geprüft wird großzügig über die Hülle jedes Segments — lieber ein Fehlalarm als eine
 * Kante quer durchs Bild.
 */
export function kantenDurchElemente(struktur: Struktur): string[] {
  const treffer: string[] = [];
  for (const [flussId, punkte] of struktur.kanten) {
    const fluss = struktur.fluesse.find((f) => f.id === flussId);
    if (!fluss) continue;
    for (let i = 0; i + 1 < punkte.length; i += 1) {
      const p = punkte[i]!;
      const q = punkte[i + 1]!;
      const huelle = {
        x: Math.min(p.x, q.x),
        y: Math.min(p.y, q.y),
        width: Math.abs(p.x - q.x),
        height: Math.abs(p.y - q.y),
      };
      for (const [elementId, kasten] of struktur.formen) {
        if (elementId === fluss.von || elementId === fluss.nach) continue;
        if (ueberlappen(huelle, kasten)) treffer.push(`${flussId} durch ${elementId}`);
      }
    }
  }
  return treffer;
}

/**
 * Spielt nach, was der Autor im Desktop Modeler tut: ein Element anfassen und verschieben.
 * Der Modeler zieht die anliegenden Kanten mit — sonst würde hier ein Zustand entstehen,
 * den es in Wirklichkeit nie gibt. Die Struktur bleibt Zeichen für Zeichen dieselbe.
 */
export async function verschiebeElement(xml: string, id: string, dx: number, dy: number): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;
  const planeElemente = rootElement.get('diagrams')[0].plane.get('planeElement');

  for (const di of planeElemente) {
    if (di.$type === 'bpmndi:BPMNShape' && di.bpmnElement?.id === id) {
      di.bounds.x += dx;
      di.bounds.y += dy;
    }
  }

  for (const di of planeElemente) {
    if (di.$type !== 'bpmndi:BPMNEdge') continue;
    const fluss = di.bpmnElement;
    if (fluss?.sourceRef?.id === id) {
      di.waypoint[0].x += dx;
      di.waypoint[0].y += dy;
    }
    if (fluss?.targetRef?.id === id) {
      di.waypoint.at(-1).x += dx;
      di.waypoint.at(-1).y += dy;
    }
  }

  return (await moddle.toXML(rootElement, { format: true })).xml;
}

/**
 * Spielt nach, was der Autor im Desktop Modeler tut, wenn er die **Struktur** anfasst:
 * ein Element danebenmalen. Es hängt an keiner Kante — genau wie ein frisch aus der Palette
 * gezogener Task, den noch niemand verbunden hat.
 */
export async function fuegeAufgabeHinzu(xml: string, id: string, name: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;

  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  const aufgabe = moddle.create('bpmn:UserTask', { id, name });
  prozess.get('flowElements').push(aufgabe);

  rootElement.get('diagrams')[0].plane.get('planeElement').push(
    moddle.create('bpmndi:BPMNShape', {
      id: `${id}_di`,
      bpmnElement: aufgabe,
      bounds: moddle.create('dc:Bounds', { x: 160, y: 400, width: 100, height: 80 }),
    }),
  );

  return (await moddle.toXML(rootElement, { format: true })).xml;
}

/** Spielt nach, wie der Autor im Modeler ein Element umbenennt. */
export async function benenneUm(xml: string, id: string, name: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;
  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  prozess.get('flowElements').find((e: any) => e.id === id).name = name;
  return (await moddle.toXML(rootElement, { format: true })).xml;
}

/** Spielt nach, wie der Autor im Modeler den Prozessnamen ändert. */
export async function benenneProzessUm(xml: string, name: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;
  rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process').name = name;
  return (await moddle.toXML(rootElement, { format: true })).xml;
}

/** Spielt nach, wie der Autor im Modeler die Ausgabe-Zuordnung eines Schritts wegnimmt. */
export async function entferneZuordnung(xml: string, id: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;
  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  const element = prozess.get('flowElements').find((e: any) => e.id === id);
  const werte = element.get('extensionElements').get('values');
  werte.splice(werte.findIndex((v: any) => v.$type === 'zeebe:IoMapping'), 1);
  return (await moddle.toXML(rootElement, { format: true })).xml;
}

/** Spielt nach, wie der Autor im Modeler den Standardpfad einer Verzweigung wegnimmt. */
export async function entferneStandardpfad(xml: string, id: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(xml)) as any;
  const prozess = rootElement.get('rootElements').find((e: any) => e.$type === 'bpmn:Process');
  delete prozess.get('flowElements').find((e: any) => e.id === id).default;
  return (await moddle.toXML(rootElement, { format: true })).xml;
}
