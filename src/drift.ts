import { createHash } from 'node:crypto';
import { neuesModdle } from './moddle.ts';
import type { Meldung } from './typen.ts';

/**
 * Drift-Erkennung (ADR 0002): das Diagramm wird erzeugt, nicht gepflegt. Hat jemand es von
 * Hand strukturell verändert, hält der Lauf an und meldet, statt zu überschreiben.
 *
 * Woher weiß der Renderer, was er zuletzt erzeugt hat? Jedes erzeugte Diagramm trägt eine
 * Signatur seiner eigenen Struktur (`prozess:signatur` an den Definitions). Beim nächsten Lauf
 * wird die Struktur des vorgefundenen Diagramms neu signiert: stimmt sie mit der eingetragenen
 * Signatur überein, hat niemand die Struktur angefasst. Positionen und Kantenverläufe gehen
 * nicht in die Signatur ein — Layout ist ausdrücklich kein Drift.
 */

export type Knoten = {
  id: string;
  typ: string;
  name?: string;
  jobType?: string;
  istBenutzerAufgabe: boolean;
  /** Ziel des Standardpfads — als Ende, nicht als Fluss-ID: die vergibt der Modeler anders. */
  standardNach?: string;
  /** Die Datenzuordnungen des Elements, sortiert — Datenfluss gehört zur Struktur. */
  zuordnungen: string[];
};

type Kante = { von: string; nach: string; name?: string; bedingung?: string };

export type Strukturbild = {
  prozessId: string;
  prozessName?: string;
  knoten: Map<string, Knoten>;
  kanten: Kante[];
  /** Die im Diagramm eingetragene Signatur — fehlt bei allem, was nicht dieser Renderer schrieb. */
  eingetrageneSignatur?: string;
};

const ARTEN: Record<string, string> = {
  'bpmn:StartEvent': 'Start',
  'bpmn:EndEvent': 'Ende',
  'bpmn:UserTask': 'Schritt für Menschen',
  'bpmn:ServiceTask': 'Schritt für ein System',
  'bpmn:ExclusiveGateway': 'Verzweigung',
};

const art = (typ: string): string => ARTEN[typ] ?? typ;

/** Wie ein Element in einer Meldung genannt wird: Art, Name und ID. */
export const bezeichnung = (knoten: Knoten): string =>
  knoten.name === undefined ? `${art(knoten.typ)} ${knoten.id}` : `${art(knoten.typ)} „${knoten.name}" (${knoten.id})`;

const kantenSchluessel = (kante: Kante): string => `${kante.von} → ${kante.nach}`;

const zitat = (wert: string | undefined): string => (wert === undefined ? 'nichts' : `„${wert}"`);

const liste = (werte: string[]): string => (werte.length === 0 ? 'nichts' : werte.map((w) => `„${w}"`).join(', '));

/**
 * Liest die Struktur eines Diagramms — alles, was keine Position ist.
 *
 * `null` heißt: das ist kein lesbares Diagramm. Der Aufrufer hat dann keine Vergleichsgrundlage
 * und prüft nicht auf Drift, statt den Lauf zu verlieren.
 */
export async function liesStrukturbild(diagramm: string): Promise<Strukturbild | null> {
  let rootElement: any;
  try {
    ({ rootElement } = (await neuesModdle().fromXML(diagramm)) as any);
  } catch {
    return null;
  }
  if (rootElement?.$type !== 'bpmn:Definitions') return null;
  return bildAus(rootElement);
}

/** Dieselbe Struktur, aber aus einem schon geparsten Diagramm. */
function bildAus(rootElement: any): Strukturbild | null {
  const prozess = (rootElement.get('rootElements') ?? []).find((e: any) => e.$type === 'bpmn:Process');
  if (!prozess) return null;

  const flowElements: any[] = prozess.get('flowElements') ?? [];
  const erweiterungen = (e: any): any[] => e.get('extensionElements')?.get('values') ?? [];

  /**
   * Ein- und Ausgabe-Zuordnungen als Text, sortiert: die Reihenfolge im XML zählt nicht, das
   * Vorhandensein schon. Wer im Modeler eine Zuordnung entfernt, soll dabei nicht lautlos
   * überschrieben werden.
   */
  const zuordnungenVon = (element: any): string[] => {
    const mapping = erweiterungen(element).find((v: any) => v.$type === 'zeebe:IoMapping');
    if (!mapping) return [];
    const alsText = (art: string, parameter: any): string =>
      `${art} ${parameter.source ?? ''} → ${parameter.target ?? ''}`;
    return [
      ...(mapping.get('inputParameters') ?? []).map((p: any) => alsText('ein', p)),
      ...(mapping.get('outputParameters') ?? []).map((p: any) => alsText('aus', p)),
    ].sort();
  };

  const knoten = new Map<string, Knoten>();
  for (const element of flowElements) {
    if (element.$type === 'bpmn:SequenceFlow' || !element.id) continue;
    const aufgabe = erweiterungen(element).find((v: any) => v.$type === 'zeebe:TaskDefinition');
    knoten.set(element.id, {
      id: element.id,
      typ: element.$type,
      ...(element.name ? { name: element.name as string } : {}),
      ...(aufgabe?.type ? { jobType: aufgabe.type as string } : {}),
      istBenutzerAufgabe: erweiterungen(element).some((v: any) => v.$type === 'zeebe:UserTask'),
      ...(element.default?.targetRef?.id ? { standardNach: element.default.targetRef.id as string } : {}),
      zuordnungen: zuordnungenVon(element),
    });
  }

  const kanten: Kante[] = [];
  for (const element of flowElements) {
    if (element.$type !== 'bpmn:SequenceFlow') continue;
    if (!element.sourceRef?.id || !element.targetRef?.id) continue;
    kanten.push({
      von: element.sourceRef.id,
      nach: element.targetRef.id,
      ...(element.name ? { name: element.name as string } : {}),
      ...(element.conditionExpression?.body ? { bedingung: element.conditionExpression.body as string } : {}),
    });
  }

  const eingetragen = rootElement.get('prozess:signatur');
  return {
    prozessId: prozess.id,
    ...(prozess.name ? { prozessName: prozess.name as string } : {}),
    knoten,
    kanten,
    ...(eingetragen ? { eingetrageneSignatur: eingetragen as string } : {}),
  };
}

/**
 * Verdichtet ein Strukturbild zu einer Zeichenkette. Sortiert, damit die Reihenfolge im XML
 * nicht zählt — der Modeler schreibt Elemente beim Speichern in seiner eigenen Ordnung.
 */
export function signatur(bild: Strukturbild): string {
  const zeilen = [
    `prozess ${bild.prozessId} ${bild.prozessName ?? ''}`,
    ...[...bild.knoten.values()].map(
      (k) =>
        `knoten ${k.id} ${k.typ} name=${k.name ?? ''} job=${k.jobType ?? ''}` +
        ` benutzeraufgabe=${k.istBenutzerAufgabe ? 1 : 0} standard=${k.standardNach ?? ''}` +
        ` zuordnungen=${k.zuordnungen.join('; ')}`,
    ),
    ...bild.kanten.map((f) => `kante ${f.von} ${f.nach} name=${f.name ?? ''} bedingung=${f.bedingung ?? ''}`),
  ];
  zeilen.sort();
  return createHash('sha256').update(zeilen.join('\n')).digest('hex').slice(0, 16);
}

/** Trägt die Signatur der eigenen Struktur in ein erzeugtes Diagramm ein. */
export async function versieheMitSignatur(diagramm: string): Promise<string> {
  const moddle = neuesModdle();
  const { rootElement } = (await moddle.fromXML(diagramm)) as any;
  const bild = bildAus(rootElement);
  if (bild === null) return diagramm;
  rootElement.set('prozess:signatur', signatur(bild));
  const { xml } = await moddle.toXML(rootElement, { format: true });
  return xml;
}

/**
 * Benennt jede strukturelle Abweichung des vorgefundenen Diagramms von dem, was die
 * Prozess-Beschreibung sagt. Leer heißt: es gibt nichts zu verlieren.
 *
 * `herkunft` trägt die Meldungen zurück an ihre Zeile in der Prozess-Beschreibung.
 */
export function vergleiche(
  vorhanden: Strukturbild,
  erzeugt: Strukturbild,
  herkunft: Map<string, number>,
): Meldung[] {
  const meldungen: Meldung[] = [];
  const melde = (text: string, id?: string): void => {
    const zeile = id === undefined ? undefined : herkunft.get(id);
    meldungen.push(zeile === undefined ? { text } : { text, zeile });
  };

  if (vorhanden.prozessId !== erzeugt.prozessId) {
    melde(
      `Die Prozess-ID weicht ab: im Diagramm „${vorhanden.prozessId}", in der Prozess-Beschreibung „${erzeugt.prozessId}".`,
    );
  }
  if ((vorhanden.prozessName ?? '') !== (erzeugt.prozessName ?? '')) {
    melde(
      `Der Prozessname weicht ab: im Diagramm ${zitat(vorhanden.prozessName)}, in der Prozess-Beschreibung ${zitat(erzeugt.prozessName)}.`,
    );
  }

  for (const knoten of vorhanden.knoten.values()) {
    if (!erzeugt.knoten.has(knoten.id)) {
      melde(`Im Diagramm steht ein Element, das die Prozess-Beschreibung nicht kennt: ${bezeichnung(knoten)}.`);
    }
  }
  for (const knoten of erzeugt.knoten.values()) {
    const gegenstueck = vorhanden.knoten.get(knoten.id);
    if (gegenstueck === undefined) {
      melde(`Im Diagramm fehlt ein Element der Prozess-Beschreibung: ${bezeichnung(knoten)}.`, knoten.id);
      continue;
    }
    if (gegenstueck.typ !== knoten.typ) {
      melde(
        `Die Art weicht ab bei ${knoten.id}: im Diagramm ${art(gegenstueck.typ)}, in der Prozess-Beschreibung ${art(knoten.typ)}.`,
        knoten.id,
      );
    }
    if (gegenstueck.name !== knoten.name) {
      melde(
        `Der Name weicht ab bei ${knoten.id}: im Diagramm ${zitat(gegenstueck.name)}, in der Prozess-Beschreibung ${zitat(knoten.name)}.`,
        knoten.id,
      );
    }
    if (gegenstueck.jobType !== knoten.jobType) {
      melde(
        `Der Job-Type weicht ab bei ${knoten.id}: im Diagramm ${zitat(gegenstueck.jobType)}, in der Prozess-Beschreibung ${zitat(knoten.jobType)}.`,
        knoten.id,
      );
    }
    if (gegenstueck.istBenutzerAufgabe !== knoten.istBenutzerAufgabe) {
      melde(
        `${knoten.id} ist im Diagramm ${gegenstueck.istBenutzerAufgabe ? '' : 'k'}eine Camunda-Benutzeraufgabe, in der Prozess-Beschreibung ${knoten.istBenutzerAufgabe ? '' : 'k'}eine.`,
        knoten.id,
      );
    }
    if (gegenstueck.zuordnungen.join('; ') !== knoten.zuordnungen.join('; ')) {
      melde(
        `Die Datenzuordnungen weichen ab bei ${knoten.id}: im Diagramm ${liste(gegenstueck.zuordnungen)}, in der Prozess-Beschreibung ${liste(knoten.zuordnungen)}.`,
        knoten.id,
      );
    }
    if (gegenstueck.standardNach !== knoten.standardNach) {
      melde(
        `Der Standardpfad weicht ab bei ${knoten.id}: im Diagramm ${zitat(gegenstueck.standardNach)}, in der Prozess-Beschreibung ${zitat(knoten.standardNach)}.`,
        knoten.id,
      );
    }
  }

  vergleicheKanten(vorhanden.kanten, erzeugt.kanten, melde);
  return meldungen;
}

/**
 * Kanten werden über ihre beiden Enden verglichen, nicht über ihre ID: eine von Hand gezogene
 * Verbindung trägt eine ID, die der Modeler vergeben hat, und wäre sonst nie zuzuordnen.
 */
function vergleicheKanten(
  vorhanden: Kante[],
  erzeugt: Kante[],
  melde: (text: string, id?: string) => void,
): void {
  const gruppiere = (kanten: Kante[]): Map<string, Kante[]> => {
    const gruppen = new Map<string, Kante[]>();
    for (const kante of kanten) {
      const schluessel = kantenSchluessel(kante);
      gruppen.set(schluessel, [...(gruppen.get(schluessel) ?? []), kante]);
    }
    return gruppen;
  };

  const hier = gruppiere(vorhanden);
  const dort = gruppiere(erzeugt);

  for (const schluessel of new Set([...hier.keys(), ...dort.keys()])) {
    const a = hier.get(schluessel) ?? [];
    const b = dort.get(schluessel) ?? [];
    for (let i = b.length; i < a.length; i += 1) {
      melde(`Im Diagramm steht eine Verbindung, die die Prozess-Beschreibung nicht kennt: ${schluessel}.`);
    }
    for (let i = a.length; i < b.length; i += 1) {
      melde(`Im Diagramm fehlt eine Verbindung der Prozess-Beschreibung: ${schluessel}.`);
    }
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
      if (a[i]!.bedingung !== b[i]!.bedingung) {
        melde(
          `Die Bedingung weicht ab bei ${schluessel}: im Diagramm ${zitat(a[i]!.bedingung)}, in der Prozess-Beschreibung ${zitat(b[i]!.bedingung)}.`,
        );
      }
      if (a[i]!.name !== b[i]!.name) {
        melde(
          `Die Beschriftung weicht ab bei ${schluessel}: im Diagramm ${zitat(a[i]!.name)}, in der Prozess-Beschreibung ${zitat(b[i]!.name)}.`,
        );
      }
    }
  }
}
