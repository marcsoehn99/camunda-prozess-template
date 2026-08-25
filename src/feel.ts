import { FeelAnalyzer } from '@bpmn-io/feel-analyzer';
import { camundaBuiltins, camundaReservedNameBuiltins } from '@camunda/feel-builtins';
import { alleSchritte, type Beschreibung } from './beschreibung.ts';
import type { Meldung } from './typen.ts';

/**
 * Die Lücke unter dem Kompatibilitätslinter: er prüft Struktur, nicht Bedeutung.
 *
 * Eine Bedingung über `tage`, wo die Variable `urlaubstage` heißt, ist für ihn tadellos — und
 * genau dort sitzt der wahrscheinlichste Fehler. Hier wird jeder FEEL-Ausdruck als Ausdruck
 * gelesen und jede benutzte Variable gegen die gehalten, die es im Prozess überhaupt gibt.
 *
 * Der Unterschied in der Schärfe ist gewollt:
 *
 * - Ein Ausdruck, der sich nicht lesen lässt, ist ein **Fehler** — er kann zur Laufzeit nur
 *   scheitern, und es entsteht kein Diagramm.
 * - Eine unbekannte Variable ist eine **Warnung**. Ein Schritt ohne `erzeugt:` gibt zurück, was
 *   sein Job Worker zurückgibt; welche Namen das sind, weiß die Prozess-Beschreibung nicht. Ein
 *   Fehler daraus würde richtige Prozesse anhalten.
 */

const analysierer = new FeelAnalyzer({
  dialect: 'expression',
  parserDialect: 'camunda',
  builtins: camundaBuiltins,
  reservedNameBuiltins: camundaReservedNameBuiltins,
});

export type Ausdrucksbefund = { fehler: Meldung[]; warnungen: Meldung[] };

/**
 * Prüft die FEEL-Ausdrücke einer Prozess-Beschreibung.
 *
 * Erwartet die Beschreibung, **nachdem** das Glossar die Namen entschieden hat: geprüft wird
 * gegen die Namen, die gelten, nicht gegen die vorgeschlagenen. Benennt das Glossar eine
 * Variable um, zeigt ein Ausdruck über den alten Namen ab hier ins Leere — und wird gemeldet.
 */
export function pruefeAusdruecke(beschreibung: Beschreibung): Ausdrucksbefund {
  const bekannt = new Set<string>();
  for (const variable of beschreibung.start.eingang ?? []) bekannt.add(variable.name);
  for (const schritt of alleSchritte(beschreibung.ablauf)) {
    if (schritt.art !== 'mensch' && schritt.art !== 'system') continue;
    if (schritt.erzeugt !== undefined) bekannt.add(schritt.erzeugt.name);
  }

  const fehler: Meldung[] = [];
  const warnungen: Meldung[] = [];

  for (const schritt of alleSchritte(beschreibung.ablauf)) {
    if (schritt.art !== 'frage') continue;

    // Das führende `=` sagt „hier kommt FEEL"; gelesen wird der Ausdruck dahinter.
    const ausdruck = schritt.wenn.slice(1);
    const ergebnis = analysierer.analyzeExpression(ausdruck);

    if (!ergebnis.valid) {
      fehler.push({
        text: `\`${schritt.wenn}\` ist kein FEEL-Ausdruck, der sich lesen lässt.`,
        zeile: schritt.wennZeile,
      });
      continue;
    }

    for (const eingabe of ergebnis.inputs ?? []) {
      if (bekannt.has(eingabe.name)) continue;
      warnungen.push({
        text:
          `Der Ausdruck \`${schritt.wenn}\` benutzt \`${eingabe.name}\`. Diese Variable kommt ` +
          `weder unter \`eingang:\` herein noch erzeugt sie ein Schritt. ` +
          (bekannt.size === 0
            ? 'Bisher erzeugt der Prozess keine Variable.'
            : `Bekannt sind: ${[...bekannt].join(', ')}.`),
        zeile: schritt.wennZeile,
      });
    }
  }

  return { fehler, warnungen };
}
