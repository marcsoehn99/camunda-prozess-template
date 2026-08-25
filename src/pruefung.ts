import { Linter } from '../vendor/camunda-linting.mjs';
import { bezeichnung, liesStrukturbild, type Strukturbild } from './drift.ts';
import type { Meldung, Pruefergebnis } from './typen.ts';

const linter = new Linter({ modeler: 'desktop' });

/**
 * Der Camunda-8-Kompatibilitätslinter — derselbe, den der Desktop Modeler für seine
 * Fehlermarker benutzt. Er läuft bei jedem Erzeugen; es gibt keinen Weg daran vorbei.
 *
 * Dazu die zwei strukturellen Fälle, bei denen er blind ist: eine Verzweigung ohne
 * Standardpfad und Elemente, die kein Pfad erreicht. Sie stehen hier und nicht neben dem
 * Linter, damit auch an ihnen niemand vorbeikommt.
 *
 * Meldungen zeigen über `herkunft` zurück auf die Prozess-Beschreibung, nicht auf das XML.
 */
export async function pruefeDiagramm(
  diagramm: string,
  herkunft: Map<string, number>,
): Promise<Pruefergebnis> {
  const berichte = await linter.lint(diagramm);

  const fehler: Meldung[] = [];
  const warnungen: Meldung[] = [];

  for (const bericht of berichte) {
    const meldung: Meldung = { text: bericht.message };
    const zeile = herkunft.get(bericht.id);
    if (zeile !== undefined) meldung.zeile = zeile;
    (bericht.category === 'error' ? fehler : warnungen).push(meldung);
  }

  const bild = await liesStrukturbild(diagramm);
  if (bild !== null) warnungen.push(...pruefeStruktur(bild, herkunft));

  return { fehler, warnungen };
}

/**
 * Die zwei Sackgassen, die kein Linter meldet.
 *
 * Beides sind Warnungen: ein Diagramm mit einer Sackgasse ist gültiges BPMN und lässt sich
 * deployen — es tut nur zur Laufzeit nicht, was der Autor meinte. Angehalten wird er dafür
 * nicht, hingewiesen schon.
 */
export function pruefeStruktur(bild: Strukturbild, herkunft: Map<string, number>): Meldung[] {
  const meldungen: Meldung[] = [];
  const melde = (text: string, id: string): void => {
    const zeile = herkunft.get(id);
    meldungen.push(zeile === undefined ? { text } : { text, zeile });
  };

  const ausgaenge = new Map<string, number>();
  for (const kante of bild.kanten) ausgaenge.set(kante.von, (ausgaenge.get(kante.von) ?? 0) + 1);

  // Ohne Standardpfad hält der Prozess an, sobald keine Bedingung zutrifft.
  for (const knoten of bild.knoten.values()) {
    if (knoten.typ !== 'bpmn:ExclusiveGateway') continue;
    if ((ausgaenge.get(knoten.id) ?? 0) < 2 || knoten.standardNach !== undefined) continue;
    melde(
      `${bezeichnung(knoten)} hat keinen Standardpfad: trifft keine Bedingung zu, bleibt der Prozess dort stehen.`,
      knoten.id,
    );
  }

  const erreicht = erreichbareKnoten(bild);
  for (const knoten of bild.knoten.values()) {
    if (erreicht.has(knoten.id)) continue;
    melde(`${bezeichnung(knoten)} ist von keinem Startereignis aus erreichbar.`, knoten.id);
  }

  return meldungen;
}

/** Alles, was von einem Startereignis aus über Verbindungen erreichbar ist. */
function erreichbareKnoten(bild: Strukturbild): Set<string> {
  const nachfolger = new Map<string, string[]>();
  for (const kante of bild.kanten) {
    nachfolger.set(kante.von, [...(nachfolger.get(kante.von) ?? []), kante.nach]);
  }

  const erreicht = new Set<string>();
  const offen = [...bild.knoten.values()]
    .filter((knoten) => knoten.typ === 'bpmn:StartEvent')
    .map((knoten) => knoten.id);

  while (offen.length > 0) {
    const id = offen.pop()!;
    if (erreicht.has(id)) continue;
    erreicht.add(id);
    offen.push(...(nachfolger.get(id) ?? []));
  }

  return erreicht;
}
