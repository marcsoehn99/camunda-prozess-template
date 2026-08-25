/**
 * Das Glossar ist das Gedächtnis für Namen (Spec, „Glossar").
 *
 * Der Autor sagt „Bestätigung senden"; welcher technische Name daraus wird, entscheidet beim
 * ersten Mal der Vorschlag aus der Prozess-Beschreibung — danach das Glossar. So heißt dieselbe
 * Sache in Runde zwölf noch, wie sie in Runde drei hieß.
 *
 * Gelesen und geschrieben wird die vorhandene Glossardatei des Projekts, in ihrer eigenen Form:
 *
 *     **Bestätigung senden**:
 *     Der Job-Type, unter dem ein Job Worker den Schritt „Bestätigung senden" aufgreift.
 *     _Technischer Name_: `bestaetigung-senden`
 *
 * Es bleibt damit ein Glossar — ein Begriff mit einer Erklärung — und wird kein
 * Konfigurationsspeicher: die einzigen Zeilen, die dieses Werkzeug versteht, sind die mit einem
 * Namen darin. Alles andere im Glossar rührt es nicht an.
 */

import { alleSchritte, type Beschreibung, type Variable } from './beschreibung.ts';
import type { Meldung } from './typen.ts';

/**
 * Wofür ein Name steht. Job-Types und Variablennamen stehen in verschiedenen Zeilen, weil ein
 * Job-Type (`rechnung-buchen`) und ein Variablenname (`rechnungsbetrag`) verschiedene Formen
 * haben — sie dürfen sich nicht gegenseitig überschreiben, wenn ein Begriff beides ist.
 */
export type Namensart = 'job-type' | 'variable';

const ETIKETT: Record<Namensart, string> = {
  'job-type': '_Technischer Name_',
  variable: '_Variablenname_',
};

/** Was ein Lauf am Glossar getan hat. */
export type Benennung = {
  /** Die neu hinzugekommenen Begriffe, als „Begriff → Name". */
  neueBegriffe: string[];
  /** Wo ein Vorschlag gegen den eingetragenen Namen verloren hat. */
  warnungen: Meldung[];
  /** Der neue Glossartext — `null`, wenn nichts nachzutragen war. */
  text: string | null;
};

/** Ein Begriff, wie ihn ein Lauf ins Glossar nachträgt. */
export type Nachtrag = {
  art: Namensart;
  /** Der gesprochene Begriff, so wie er in der Prozess-Beschreibung steht. */
  begriff: string;
  /** Der technische Name, der ihm zugeordnet wird. */
  name: string;
  /** Die Erklärung für einen Begriff, den das Glossar noch gar nicht kennt. */
  erklaerung: string;
};

type Block = {
  begriff: string;
  /** Index der letzten Zeile des Blocks in `zeilen`. */
  letzteZeile: number;
  /** Die eingetragenen Namen dieses Blocks, je Art höchstens einer. */
  namen: Map<Namensart, string>;
};

export type Glossar = {
  zeilen: string[];
  /** Blöcke nach normalisiertem Begriff. */
  bloecke: Map<string, Block>;
  /** Index, hinter dem ein neuer Block eingefügt wird. */
  einfuegenNach: number;
};

const BEGRIFF = /^\*\*(.+?)\*\*:\s*$/;
const NAME = /^(_Technischer Name_|_Variablenname_):\s*`(.+?)`\s*$/;
const UEBERSCHRIFT = /^##\s+/;

const ART_ZU_ETIKETT = new Map<string, Namensart>(
  Object.entries(ETIKETT).map(([art, etikett]) => [etikett, art as Namensart]),
);

/**
 * Begriffe werden nach Groß-/Kleinschreibung und Leerraum unabhängig wiedererkannt: „bestätigung
 * senden" und „Bestätigung  senden" meinen dieselbe Sache, und der Autor spricht in Sätzen.
 */
const normalisiere = (begriff: string): string =>
  begriff.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de');

/** Liest ein Glossar. `null` heißt: es gibt keins — dann merkt sich dieser Lauf nichts. */
export function liesGlossar(text: string | null | undefined): Glossar | null {
  if (text === null || text === undefined) return null;

  const zeilen = text.split('\n');
  const bloecke = new Map<string, Block>();
  let einfuegenNach = -1;
  let offen: Block | null = null;

  zeilen.forEach((zeile, index) => {
    const begonnen = BEGRIFF.exec(zeile);
    if (begonnen) {
      offen = { begriff: begonnen[1]!, letzteZeile: index, namen: new Map() };
      bloecke.set(normalisiere(offen.begriff), offen);
      einfuegenNach = index;
      return;
    }
    if (offen === null) return;
    if (zeile.trim() === '') {
      offen = null;
      return;
    }
    offen.letzteZeile = index;
    einfuegenNach = index;
    const name = NAME.exec(zeile);
    const art = name && ART_ZU_ETIKETT.get(name[1]!);
    if (art) offen.namen.set(art, name[2]!);
  });

  // Steht noch kein einziger Begriff drin, gehört der erste unter die Überschrift des
  // Glossarteils — und nicht ans Ende einer Datei, die weiterhin ganz anderes enthalten kann.
  if (einfuegenNach === -1) {
    const ueberschrift = zeilen.findIndex((zeile) => UEBERSCHRIFT.test(zeile));
    einfuegenNach = ueberschrift === -1 ? zeilen.length - 1 : ueberschrift;
  }

  return { zeilen, bloecke, einfuegenNach };
}

/** Der Name, den das Glossar für diesen Begriff kennt — oder `undefined`. */
export function nameVon(glossar: Glossar, art: Namensart, begriff: string): string | undefined {
  return glossar.bloecke.get(normalisiere(begriff))?.namen.get(art);
}

/**
 * Trägt Begriffe nach und liefert den neuen Glossartext.
 *
 * Ein Begriff, den das Glossar schon als Wort kennt, bekommt nur die Zeile mit dem technischen
 * Namen an seinen vorhandenen Block — er wird kein zweites Mal angelegt.
 */
export function trageNach(glossar: Glossar, nachtraege: Nachtrag[]): string {
  const zeilen = [...glossar.zeilen];
  /** Was hinter welchen Zeilenindex eingeschoben wird; erst am Ende angewandt. */
  const einschuebe = new Map<number, string[]>();
  const einschieben = (index: number, neu: string[]): void => {
    einschuebe.set(index, [...(einschuebe.get(index) ?? []), ...neu]);
  };

  for (const nachtrag of nachtraege) {
    const namenszeile = `${ETIKETT[nachtrag.art]}: \`${nachtrag.name}\``;
    const vorhanden = glossar.bloecke.get(normalisiere(nachtrag.begriff));
    if (vorhanden) {
      einschieben(vorhanden.letzteZeile, [namenszeile]);
    } else {
      einschieben(glossar.einfuegenNach, ['', `**${nachtrag.begriff}**:`, nachtrag.erklaerung, namenszeile]);
    }
  }

  const ergebnis: string[] = [];
  zeilen.forEach((zeile, index) => {
    ergebnis.push(zeile);
    ergebnis.push(...(einschuebe.get(index) ?? []));
  });

  // Genau ein Zeilenumbruch am Ende — die Datei ist eine Textdatei, keine Ausgabe.
  return `${ergebnis.join('\n').replace(/\s+$/, '')}\n`;
}

/**
 * Legt das Glossar über eine gelesene Prozess-Beschreibung: bekannte Begriffe bekommen ihren
 * eingetragenen Namen, unbekannte werden nachgetragen. Ohne Rückfrage — ein Prozess mit acht
 * Schritten soll nicht acht Unterbrechungen bedeuten.
 *
 * Die Beschreibung wird dabei an Ort und Stelle auf die gültigen Namen gezogen; sie ist das
 * frische Leseergebnis dieses Laufs und gehört niemandem sonst.
 */
export function benenne(beschreibung: Beschreibung, glossarText: string | null | undefined): Benennung {
  const glossar = liesGlossar(glossarText);
  if (glossar === null) return { neueBegriffe: [], warnungen: [], text: null };

  const nachtraege: Nachtrag[] = [];
  const warnungen: Meldung[] = [];
  /** Was dieser Lauf selbst schon vergeben hat — sonst stünde derselbe Begriff zweimal drin. */
  const vergeben = new Map<string, string>();

  /**
   * Der Name, der für diesen Begriff gilt: der eingetragene, wenn es ihn gibt — sonst der
   * Vorschlag aus der Prozess-Beschreibung, der dann nachgetragen wird.
   */
  function gueltigerName(
    art: Namensart,
    begriff: string,
    vorschlag: string,
    zeile: number,
    erklaerung: string,
    verloren: (bekannt: string) => string,
  ): string {
    const schluessel = `${art} ${normalisiere(begriff)}`;
    const bekannt = nameVon(glossar!, art, begriff) ?? vergeben.get(schluessel);
    if (bekannt === undefined) {
      vergeben.set(schluessel, vorschlag);
      nachtraege.push({ art, begriff, name: vorschlag, erklaerung });
      return vorschlag;
    }
    if (bekannt !== vorschlag) warnungen.push({ text: verloren(bekannt), zeile });
    return bekannt;
  }

  /** Zieht eine Variable auf den Namen, der im Glossar gilt. */
  const benenneVariable = (variable: Variable): void => {
    variable.name = gueltigerName(
      'variable',
      variable.begriff,
      variable.name,
      variable.zeile,
      `Die Prozessvariable, unter der „${variable.begriff}" durch den Prozess läuft.`,
      (bekannt) =>
        `Die Variable für „${variable.begriff}" heißt im Glossar \`${bekannt}\`; ` +
        `der Vorschlag \`${variable.name}\` wurde nicht übernommen.`,
    );
  };

  // In der Reihenfolge der Beschreibung: was der Start hereinbringt, kommt vor den Schritten.
  for (const variable of beschreibung.start.eingang ?? []) benenneVariable(variable);

  for (const schritt of alleSchritte(beschreibung.ablauf)) {
    if (schritt.art === 'system') {
      schritt.jobType = gueltigerName(
        'job-type',
        schritt.name,
        schritt.jobType,
        schritt.zeile,
        `Der Job-Type, unter dem ein Job Worker den Schritt „${schritt.name}" aufgreift.`,
        (bekannt) =>
          `Der Job-Type für „${schritt.name}" heißt im Glossar \`${bekannt}\`; ` +
          `der Vorschlag \`${schritt.jobType}\` wurde nicht übernommen.`,
      );
    }
    if (schritt.art === 'system' || schritt.art === 'mensch') {
      if (schritt.erzeugt !== undefined) benenneVariable(schritt.erzeugt);
    }
  }

  return {
    neueBegriffe: nachtraege.map((n) => `${n.begriff} → ${n.name}`),
    warnungen,
    text: nachtraege.length === 0 ? null : trageNach(glossar, nachtraege),
  };
}
