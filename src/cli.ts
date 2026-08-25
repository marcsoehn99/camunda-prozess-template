#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { diagrammPfadFuer } from './pfade.ts';
import { rendere, STANDARD_PLATTFORM_VERSION } from './renderer.ts';
import type { Meldung } from './typen.ts';

/**
 * Dünne Hülle um den Renderer: Dateien lesen, Funktion rufen, Dateien schreiben, ausgeben.
 * Hier steht bewusst keine Logik, die man testen wollen würde.
 */

/** Die vorhandene Glossardatei des Projekts. */
const STANDARD_GLOSSAR = 'CONTEXT.md';

const HILFE = `prozess <beschreibung.prozess.yaml> [--diagramm <pfad.bpmn>] [--layout-neu]
              [--drift-verwerfen] [--glossar <pfad.md>] [--plattform-version <8.9.0>]

Erzeugt aus einer Prozess-Beschreibung ein geprüftes Diagramm.
Ohne --diagramm wird neben die Beschreibung geschrieben (<name>.bpmn).

Liegt dort schon ein Diagramm, behalten dessen Elemente ihre Positionen; nur neue werden
platziert. --layout-neu wirft das weg und rechnet das Layout komplett neu.

Wurde das vorhandene Diagramm von Hand strukturell verändert, hält der Lauf an und benennt die
Abweichung. --drift-verwerfen erzeugt trotzdem und überschreibt die Handänderung.

Technische Namen kommen aus dem Glossar (--glossar, ohne Angabe ${STANDARD_GLOSSAR}). Ein dort
bekannter Begriff gewinnt gegen einen abweichenden Vorschlag; ein unbekannter wird nachgetragen
und am Ende des Laufs berichtet.`;

function zeigeMeldungen(titel: string, meldungen: Meldung[], quelle: string): void {
  if (meldungen.length === 0) return;
  console.error(`${titel}:`);
  for (const meldung of meldungen) {
    const stelle = meldung.zeile === undefined ? quelle : `${quelle}:${meldung.zeile}`;
    console.error(`  ${stelle}  ${meldung.text}`);
  }
}

async function main(argv: string[]): Promise<number> {
  const positional: string[] = [];
  let ziel: string | undefined;
  let plattformVersion: string | undefined;
  let glossarPfad: string | undefined;
  let layoutNeuBerechnen = false;
  let driftVerwerfen = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(HILFE);
      return 0;
    } else if (arg === '--diagramm') {
      ziel = argv[++i];
    } else if (arg === '--glossar') {
      glossarPfad = argv[++i];
    } else if (arg === '--layout-neu') {
      layoutNeuBerechnen = true;
    } else if (arg === '--drift-verwerfen') {
      driftVerwerfen = true;
    } else if (arg === '--plattform-version') {
      plattformVersion = argv[++i];
    } else {
      positional.push(arg);
    }
  }

  const quelle = positional[0];
  if (quelle === undefined) {
    console.error(HILFE);
    return 2;
  }

  const diagrammPfad = ziel ?? diagrammPfadFuer(quelle);
  const glossarDatei = glossarPfad ?? STANDARD_GLOSSAR;
  const glossar = await readFile(glossarDatei, 'utf8').catch(() => null);

  const ergebnis = await rendere({
    beschreibung: await readFile(quelle, 'utf8'),
    vorherigesDiagramm: await readFile(diagrammPfad, 'utf8').catch(() => null),
    glossar,
    layoutNeuBerechnen,
    driftVerwerfen,
    plattformVersion: plattformVersion ?? process.env.PROZESS_PLATTFORM_VERSION,
  });

  if (ergebnis.drift.istDrift) {
    console.error(`Das Diagramm ${diagrammPfad} wurde seit dem letzten Erzeugen von Hand strukturell verändert.`);
    zeigeMeldungen('Abweichungen', ergebnis.drift.abweichungen, quelle);
    console.error(
      'Übernehmen: die Änderung in die Prozess-Beschreibung schreiben und erneut erzeugen.\n' +
        'Verwerfen:  noch einmal mit --drift-verwerfen aufrufen.',
    );
    console.error('Kein Diagramm geschrieben.');
    return 1;
  }

  zeigeMeldungen('Fehler', ergebnis.pruefung.fehler, quelle);
  zeigeMeldungen('Warnungen', ergebnis.pruefung.warnungen, quelle);

  if (ergebnis.diagramm === null) {
    console.error('Kein Diagramm geschrieben.');
    return 1;
  }

  await writeFile(diagrammPfad, ergebnis.diagramm, 'utf8');
  if (ergebnis.glossar !== null) await writeFile(glossarDatei, ergebnis.glossar, 'utf8');
  console.log(`Diagramm geschrieben: ${diagrammPfad}`);
  console.log(
    `Ziel-Ausführungsplattform: Camunda ${plattformVersion ?? process.env.PROZESS_PLATTFORM_VERSION ?? STANDARD_PLATTFORM_VERSION}`,
  );
  if (glossar === null) {
    console.log(`Kein Glossar unter ${glossarDatei} — dieser Lauf hat sich keine Namen gemerkt.`);
  } else {
    console.log(
      ergebnis.neueBegriffe.length === 0
        ? 'Neue Begriffe: keine'
        : `Neue Begriffe in ${glossarDatei}: ${ergebnis.neueBegriffe.join(', ')}`,
    );
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
