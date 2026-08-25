import { leseBeschreibung } from './beschreibung.ts';
import { baueDiagramm } from './diagramm.ts';
import { benenne } from './glossar.ts';
import { liesStrukturbild, signatur, vergleiche, versieheMitSignatur } from './drift.ts';
import { pruefeAusdruecke } from './feel.ts';
import { liesLayout, uebernimmLayout } from './layout.ts';
import { pruefeDiagramm } from './pruefung.ts';
import type { Driftergebnis, Meldung, RenderEingabe, RenderErgebnis } from './typen.ts';

/**
 * Voreingestellte Ziel-Ausführungsplattformversion. Begründet in ADR 0003.
 */
export const STANDARD_PLATTFORM_VERSION = '8.9.0';

const KEIN_DRIFT: Driftergebnis = { istDrift: false, abweichungen: [] };

/**
 * Der eine Seam: Prozess-Beschreibung rein, geprüftes Diagramm raus.
 *
 * Nimmt Inhalte, keine Pfade. Kein Dateisystem, kein Sprachmodell, kein Netz.
 * Gibt es Fehler, ist `diagramm` `null` — ein ungeprüftes Diagramm kann nicht entstehen.
 */
export async function rendere(eingabe: RenderEingabe): Promise<RenderErgebnis> {
  const gelesen = leseBeschreibung(eingabe.beschreibung);
  if (!gelesen.ok) {
    return {
      diagramm: null,
      pruefung: { fehler: gelesen.fehler, warnungen: [] },
      neueBegriffe: [],
      glossar: null,
      drift: KEIN_DRIFT,
    };
  }

  const plattformVersion = eingabe.plattformVersion ?? STANDARD_PLATTFORM_VERSION;

  // Namen zuerst: das Diagramm soll die Namen tragen, die gelten — nicht die vorgeschlagenen.
  const benennung = benenne(gelesen.beschreibung, eingabe.glossar);

  // Ausdrücke vor dem Bauen: ein Ausdruck, der sich nicht lesen lässt, soll die Zeile in der
  // Prozess-Beschreibung nennen — und nicht als „Property <conditionExpression>" aus dem
  // Linter zurückkommen, der denselben Tippfehler ein zweites Mal meldet.
  const ausdruecke = pruefeAusdruecke(gelesen.beschreibung);
  if (ausdruecke.fehler.length > 0) {
    return {
      diagramm: null,
      pruefung: { fehler: ausdruecke.fehler, warnungen: ausdruecke.warnungen },
      neueBegriffe: [],
      glossar: null,
      drift: KEIN_DRIFT,
    };
  }

  let diagramm: string;
  let herkunft: Map<string, number>;
  try {
    const gebaut = await baueDiagramm(gelesen.beschreibung, plattformVersion);
    diagramm = gebaut.xml;
    herkunft = gebaut.herkunft;
  } catch (fehler) {
    return {
      diagramm: null,
      pruefung: {
        fehler: [{ text: `Das Diagramm konnte nicht erzeugt werden: ${(fehler as Error).message}` }],
        warnungen: [],
      },
      neueBegriffe: [],
      glossar: null,
      drift: KEIN_DRIFT,
    };
  }

  // Struktur gehört der Prozess-Beschreibung: was von Hand daran geändert wurde, hält den
  // Lauf an, statt überschrieben zu werden (ADR 0002).
  const driftMeldungen: Meldung[] = [];
  if (eingabe.vorherigesDiagramm && eingabe.driftVerwerfen !== true) {
    const drift = await pruefeDrift(eingabe.vorherigesDiagramm, diagramm, herkunft);
    if (drift.istDrift) {
      return {
        diagramm: null,
        pruefung: { fehler: [], warnungen: [] },
        neueBegriffe: [],
        glossar: null,
        drift,
      };
    }
    driftMeldungen.push(...drift.abweichungen);
  }

  // Layout gehört dem Autor: was im vorherigen Diagramm schon lag, bleibt liegen (ADR 0002).
  const layoutMeldungen: Meldung[] = [];
  if (eingabe.vorherigesDiagramm && eingabe.layoutNeuBerechnen !== true) {
    const vorher = await liesLayout(eingabe.vorherigesDiagramm);
    if (vorher === null) {
      layoutMeldungen.push({
        text: 'Das vorherige Diagramm ließ sich nicht lesen; das Layout wurde neu berechnet.',
      });
    } else {
      diagramm = await uebernimmLayout(diagramm, vorher);
    }
  }

  diagramm = await versieheMitSignatur(diagramm);

  const pruefung = await pruefeDiagramm(diagramm, herkunft);
  pruefung.warnungen.push(
    ...ausdruecke.warnungen,
    ...benennung.warnungen,
    ...layoutMeldungen,
    ...driftMeldungen,
  );

  const geschrieben = pruefung.fehler.length === 0;
  return {
    diagramm: geschrieben ? diagramm : null,
    pruefung,
    // Entsteht kein Diagramm, wächst auch das Glossar nicht: sonst stünden dort Namen für
    // einen Prozess, den es nicht gibt.
    neueBegriffe: geschrieben ? benennung.neueBegriffe : [],
    glossar: geschrieben ? benennung.text : null,
    drift: KEIN_DRIFT,
  };
}

/**
 * Vergleicht das vorgefundene Diagramm mit dem, was zuletzt erzeugt wurde.
 *
 * Drift ist beides zusammen: die Struktur trägt nicht mehr die Signatur, die der Renderer ihr
 * mitgegeben hat — **und** sie weicht von dem ab, was die Prozess-Beschreibung sagt. Fehlt das
 * Zweite, gäbe es nichts zu verlieren: der Autor hat seine Handänderung längst in die
 * Beschreibung übernommen, und der Lauf soll ihn nicht ein zweites Mal anhalten.
 *
 * Ohne eingetragene Signatur gibt es keine Vergleichsgrundlage. Dann wird gewarnt statt
 * angehalten — sonst würde jedes vor der Drift-Erkennung erzeugte Diagramm den Lauf blockieren.
 */
async function pruefeDrift(
  vorherigesDiagramm: string,
  erzeugtesDiagramm: string,
  herkunft: Map<string, number>,
): Promise<Driftergebnis> {
  const vorhanden = await liesStrukturbild(vorherigesDiagramm);
  if (vorhanden === null) return KEIN_DRIFT;

  if (vorhanden.eingetrageneSignatur === undefined) {
    return {
      istDrift: false,
      abweichungen: [
        {
          text: 'Das vorhandene Diagramm trägt keine Signatur; ob seine Struktur von Hand verändert wurde, ist nicht feststellbar. Es wird überschrieben.',
        },
      ],
    };
  }
  if (vorhanden.eingetrageneSignatur === signatur(vorhanden)) return KEIN_DRIFT;

  const erzeugt = await liesStrukturbild(erzeugtesDiagramm);
  if (erzeugt === null) return KEIN_DRIFT;

  const abweichungen = vergleiche(vorhanden, erzeugt, herkunft);
  return abweichungen.length === 0 ? KEIN_DRIFT : { istDrift: true, abweichungen };
}
