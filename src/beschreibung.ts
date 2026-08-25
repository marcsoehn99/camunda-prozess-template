import { LineCounter, parseDocument, isMap, isScalar, isSeq } from 'yaml';
import { variablenName } from './bezeichner.ts';
import type { Meldung } from './typen.ts';

/** Der Name, unter dem ein `weiter-bei:` diesen Schritt findet. */
export type Marke = { name: string; zeile: number };

/**
 * Eine Prozessvariable: der Begriff, wie der Autor ihn nennt, und der technische Name, unter
 * dem sie durch den Prozess läuft. Der Name ist zunächst nur ein Vorschlag — das Glossar
 * entscheidet ihn, genau wie beim Job-Type.
 */
export type Variable = { begriff: string; name: string; zeile: number };

/** Ein Schritt, den ein Mensch erledigt — im Diagramm ein User Task. */
export type MenschSchritt = {
  art: 'mensch';
  name: string;
  /** Die Variable, unter der das Ergebnis dieses Schritts weiterläuft. */
  erzeugt?: Variable;
  zeile: number;
  marke?: Marke;
};

/** Ein Schritt, den ein Job Worker erledigt — im Diagramm ein Service Task. */
export type SystemSchritt = {
  art: 'system';
  name: string;
  /** Der Job-Type, an dem der Worker den Schritt aufgreift. */
  jobType: string;
  /** Die Variable, unter der das Ergebnis dieses Schritts weiterläuft. */
  erzeugt?: Variable;
  zeile: number;
  marke?: Marke;
};

/** Die Schritte, die ein Ergebnis weitergeben können. */
export type ErgebnisSchritt = MenschSchritt | SystemSchritt;

/** Das Ende eines Ablaufs — im Diagramm ein Endereignis. */
export type EndeSchritt = { art: 'ende'; name: string; zeile: number; marke?: Marke };

/**
 * Eine Entscheidung an Daten — im Diagramm ein exklusives Gateway.
 *
 * Ein leerer Zweig heißt **durchfallen**: der Ablauf läuft hinter dem `frage:`-Block weiter.
 */
export type FrageSchritt = {
  art: 'frage';
  name: string;
  /** Die FEEL-Bedingung; sie hängt später am Fluss des `dann:`-Zweigs. */
  wenn: string;
  wennZeile: number;
  dann: Schritt[];
  sonst: Schritt[];
  zeile: number;
  marke?: Marke;
};

/** Der Notausgang: weiter beim Schritt mit dieser `marke:`. */
export type SprungSchritt = { art: 'sprung'; marke: string; zeile: number };

export type Schritt = MenschSchritt | SystemSchritt | EndeSchritt | FrageSchritt | SprungSchritt;

/** Jeder Schritt außer dem Sprung wird ein Element im Diagramm. */
export type ElementSchritt = MenschSchritt | SystemSchritt | EndeSchritt | FrageSchritt;

export type Beschreibung = {
  /** Technischer Name des Prozesses; wird die Prozess-ID im Diagramm. */
  prozess: string;
  name?: string;
  /** `eingang:` sind die Variablen, die beim Start von außen hereinkommen. */
  start: { name?: string; eingang?: Variable[]; zeile: number };
  ablauf: Schritt[];
};

export type LeseErgebnis =
  | { ok: true; beschreibung: Beschreibung }
  | { ok: false; fehler: Meldung[] };

const ROOT_SCHLUESSEL = ['prozess', 'name', 'start', 'ablauf'];
const START_SCHLUESSEL = ['name', 'eingang'];

/** Der Schlüssel, der die Art eines Schritts bestimmt — genau einer davon je Schritt. */
const ART_SCHLUESSEL = ['mensch', 'system', 'ende', 'frage', 'weiter-bei'] as const;
type ArtSchluessel = (typeof ART_SCHLUESSEL)[number];

/** Was neben dem Art-Schlüssel noch in einem Schritt stehen darf. */
const ZUSATZ_SCHLUESSEL: Record<ArtSchluessel, string[]> = {
  mensch: ['erzeugt', 'marke'],
  system: ['job-type', 'erzeugt', 'marke'],
  ende: ['marke'],
  frage: ['wenn', 'dann', 'sonst', 'marke'],
  'weiter-bei': [],
};

const PROZESS_ID = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const MARKE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

type MitRange = { range?: [number, number, number] | null };

/** Liefert den Text eines Skalars, oder `undefined`, wenn dort kein Text steht. */
function textWert(knoten: unknown): string | undefined {
  if (!isScalar(knoten)) return undefined;
  return typeof knoten.value === 'string' ? knoten.value : undefined;
}

/**
 * Ob eine Schrittfolge von selbst endet — mit `ende:`, mit einem Sprung, oder mit einer
 * Verzweigung, deren beide Zweige enden. Was danach steht, kann kein Pfad mehr erreichen.
 */
function endetVonSelbst(schritte: Schritt[]): boolean {
  const letzter = schritte[schritte.length - 1];
  if (letzter === undefined) return false;
  if (letzter.art === 'ende' || letzter.art === 'sprung') return true;
  if (letzter.art !== 'frage') return false;
  return (
    letzter.dann.length > 0 &&
    letzter.sonst.length > 0 &&
    endetVonSelbst(letzter.dann) &&
    endetVonSelbst(letzter.sonst)
  );
}

/** Läuft über alle Schritte, auch die in Zweigen. */
export function* alleSchritte(schritte: Schritt[]): Generator<Schritt> {
  for (const schritt of schritte) {
    yield schritt;
    if (schritt.art === 'frage') {
      yield* alleSchritte(schritt.dann);
      yield* alleSchritte(schritt.sonst);
    }
  }
}

/**
 * Liest eine Prozess-Beschreibung und lehnt ab, was der Renderer nicht abbilden kann.
 * Es wird nichts ersatzweise gerendert: entweder das Modell steht, oder es gibt Fehler mit Zeile.
 */
export function leseBeschreibung(text: string): LeseErgebnis {
  const zeilen = new LineCounter();
  const doc = parseDocument(text, { lineCounter: zeilen });

  const zeileVon = (knoten: unknown, ersatz = 1): number => {
    const range = (knoten as MitRange | undefined)?.range;
    if (!range) return ersatz;
    return zeilen.linePos(range[0]).line;
  };

  const fehler: Meldung[] = [];
  for (const e of doc.errors) {
    fehler.push({ text: e.message, zeile: zeilen.linePos(e.pos[0]).line });
  }
  if (fehler.length > 0) return { ok: false, fehler };

  const wurzel = doc.contents;
  if (!isMap(wurzel)) {
    return {
      ok: false,
      fehler: [{ text: 'Die Prozess-Beschreibung muss eine Zuordnung mit `prozess:` und `ablauf:` sein.', zeile: 1 }],
    };
  }

  for (const paar of wurzel.items) {
    const schluessel = isScalar(paar.key) ? String(paar.key.value) : '';
    if (!ROOT_SCHLUESSEL.includes(schluessel)) {
      fehler.push({
        text: `Unbekannter Schlüssel \`${schluessel}\`. Erlaubt sind: ${ROOT_SCHLUESSEL.join(', ')}.`,
        zeile: zeileVon(paar.key),
      });
    }
  }

  const knotenVon = (schluessel: string) => wurzel.get(schluessel, true);

  const prozessKnoten = knotenVon('prozess');
  let prozess = '';
  if (prozessKnoten === undefined) {
    fehler.push({ text: 'Es fehlt `prozess:` — der technische Name des Prozesses.', zeile: 1 });
  } else if (textWert(prozessKnoten) === undefined) {
    fehler.push({ text: '`prozess:` muss ein Text sein.', zeile: zeileVon(prozessKnoten) });
  } else if (!PROZESS_ID.test(textWert(prozessKnoten)!)) {
    fehler.push({
      text: '`prozess:` darf nur Buchstaben, Ziffern, `_`, `-` und `.` enthalten und muss mit einem Buchstaben beginnen.',
      zeile: zeileVon(prozessKnoten),
    });
  } else {
    prozess = textWert(prozessKnoten)!;
  }

  const nameKnoten = knotenVon('name');
  let name: string | undefined;
  if (nameKnoten !== undefined) {
    const wert = textWert(nameKnoten);
    if (wert === undefined || wert.trim() === '') {
      fehler.push({ text: '`name:` muss ein nicht leerer Text sein.', zeile: zeileVon(nameKnoten) });
    } else {
      name = wert;
    }
  }

  /**
   * Liest einen Begriff als Prozessvariable. Der technische Name ist hier nur der Vorschlag,
   * der sich aus dem Begriff ergibt; das Glossar zieht ihn danach auf den gültigen Namen.
   */
  function leseVariable(knoten: unknown, ersatzZeile: number, wo: string): Variable | undefined {
    const zeile = zeileVon(knoten, ersatzZeile);
    const begriff = textWert(knoten);
    if (begriff === undefined || begriff.trim() === '') {
      fehler.push({ text: `${wo} braucht den Begriff, unter dem die Variable weiterläuft.`, zeile });
      return undefined;
    }
    const name = variablenName(begriff);
    if (name === undefined) {
      fehler.push({ text: `Aus \`${begriff}\` lässt sich kein Variablenname bilden — er braucht Buchstaben.`, zeile });
      return undefined;
    }
    return { begriff: begriff.trim(), name, zeile };
  }

  const startKnoten = knotenVon('start');
  const start: { name?: string; eingang?: Variable[]; zeile: number } = {
    zeile: startKnoten ? zeileVon(startKnoten) : 1,
  };
  if (startKnoten !== undefined) {
    if (!isMap(startKnoten)) {
      fehler.push({ text: '`start:` muss eine Zuordnung sein, etwa `start:` mit `name: Rechnung eingegangen`.', zeile: zeileVon(startKnoten) });
    } else {
      for (const paar of startKnoten.items) {
        const schluessel = isScalar(paar.key) ? String(paar.key.value) : '';
        if (!START_SCHLUESSEL.includes(schluessel)) {
          fehler.push({
            text: `Unbekannter Schlüssel \`${schluessel}\` unter \`start:\`. Erlaubt ist: ${START_SCHLUESSEL.join(', ')}.`,
            zeile: zeileVon(paar.key),
          });
        }
      }
      const startName = startKnoten.get('name', true);
      if (startName !== undefined) {
        const wert = textWert(startName);
        if (wert === undefined || wert.trim() === '') {
          fehler.push({ text: '`name:` unter `start:` muss ein nicht leerer Text sein.', zeile: zeileVon(startName) });
        } else {
          start.name = wert;
        }
      }

      const eingangKnoten = startKnoten.get('eingang', true);
      if (eingangKnoten !== undefined) {
        if (!isSeq(eingangKnoten)) {
          fehler.push({
            text: '`eingang:` muss eine Liste von Begriffen sein, etwa `eingang: [Rechnungsbetrag, Lieferant]`.',
            zeile: zeileVon(eingangKnoten),
          });
        } else if (eingangKnoten.items.length === 0) {
          fehler.push({
            text: '`eingang:` ist leer — kommen keine Variablen herein, wird der Schlüssel weggelassen.',
            zeile: zeileVon(eingangKnoten),
          });
        } else {
          const zeile = zeileVon(eingangKnoten);
          start.eingang = eingangKnoten.items
            .map((eintrag) => leseVariable(eintrag, zeile, 'Ein Eintrag unter `eingang:`'))
            .filter((variable) => variable !== undefined);
        }
      }
    }
  }

  /** Liest einen Zweig (`dann:`/`sonst:`). Fehlt er, fällt der Zweig durch — das ist kein Fehler. */
  function leseZweig(eintrag: unknown, schluessel: string, elternZeile: number): Schritt[] {
    const knoten = (eintrag as { get(k: string, keep: boolean): unknown }).get(schluessel, true);
    if (knoten === undefined) return [];
    if (!isSeq(knoten)) {
      fehler.push({ text: `\`${schluessel}:\` muss eine Liste von Schritten sein.`, zeile: zeileVon(knoten, elternZeile) });
      return [];
    }
    if (knoten.items.length === 0) {
      fehler.push({
        text: `\`${schluessel}:\` ist leer — ein Zweig, der nichts tut, wird weggelassen statt hingeschrieben.`,
        zeile: zeileVon(knoten, elternZeile),
      });
      return [];
    }
    return leseFolge(knoten);
  }

  /** Liest eine Schrittfolge: den Ablauf selbst oder einen Zweig. */
  function leseFolge(folgeKnoten: { items: unknown[] }): Schritt[] {
    const schritte: Schritt[] = [];

    for (const eintrag of folgeKnoten.items) {
      const zeile = zeileVon(eintrag);
      if (!isMap(eintrag)) {
        fehler.push({ text: 'Ein Schritt muss eine Zuordnung sein, etwa `- mensch: Freigabe erteilen`.', zeile });
        continue;
      }

      const arten: ArtSchluessel[] = [];
      for (const paar of eintrag.items) {
        const schluessel = isScalar(paar.key) ? String(paar.key.value) : '';
        if ((ART_SCHLUESSEL as readonly string[]).includes(schluessel)) arten.push(schluessel as ArtSchluessel);
      }

      if (arten.length === 0) {
        fehler.push({ text: `Ein Schritt braucht genau einen der Schlüssel ${ART_SCHLUESSEL.join(', ')}.`, zeile });
        continue;
      }
      if (arten.length > 1) {
        fehler.push({ text: `Ein Schritt darf nur einen der Schlüssel ${ART_SCHLUESSEL.join(', ')} tragen.`, zeile });
        continue;
      }

      const art = arten[0]!;
      const erlaubt = [art as string, ...ZUSATZ_SCHLUESSEL[art]];
      let unbekannt = false;
      for (const paar of eintrag.items) {
        const schluessel = isScalar(paar.key) ? String(paar.key.value) : '';
        if (!erlaubt.includes(schluessel)) {
          fehler.push({
            text: `Unbekannter Schlüssel \`${schluessel}\` in einem \`${art}:\`-Schritt. Erlaubt sind: ${erlaubt.join(', ')}.`,
            zeile: zeileVon(paar.key, zeile),
          });
          unbekannt = true;
        }
      }
      if (unbekannt) continue;

      const markeKnoten = eintrag.get('marke', true);
      let marke: Marke | undefined;
      if (markeKnoten !== undefined) {
        const wert = textWert(markeKnoten);
        if (wert === undefined || !MARKE.test(wert)) {
          fehler.push({
            text: '`marke:` muss ein Name aus Buchstaben, Ziffern, `_`, `-` und `.` sein, der mit einem Buchstaben beginnt.',
            zeile: zeileVon(markeKnoten, zeile),
          });
          continue;
        }
        marke = { name: wert, zeile: zeileVon(markeKnoten, zeile) };
      }

      const erzeugtKnoten = eintrag.get('erzeugt', true);
      const erzeugt = erzeugtKnoten === undefined ? undefined : leseVariable(erzeugtKnoten, zeile, '`erzeugt:`');

      const artKnoten = eintrag.get(art, true);
      const wert = textWert(artKnoten);
      if (wert === undefined || wert.trim() === '') {
        fehler.push({
          text: art === 'weiter-bei'
            ? '`weiter-bei:` braucht die Marke, bei der es weitergeht.'
            : `\`${art}:\` braucht einen nicht leeren Namen.`,
          zeile: zeileVon(artKnoten, zeile),
        });
        continue;
      }

      if (art === 'weiter-bei') {
        if (!MARKE.test(wert)) {
          fehler.push({ text: `\`weiter-bei: ${wert}\` ist kein Markenname.`, zeile: zeileVon(artKnoten, zeile) });
          continue;
        }
        schritte.push({ art: 'sprung', marke: wert, zeile });
      } else if (art === 'system') {
        const jobKnoten = eintrag.get('job-type', true);
        const jobType = textWert(jobKnoten);
        if (jobType === undefined || jobType.trim() === '') {
          fehler.push({
            text: 'Ein `system:`-Schritt braucht `job-type:` — sonst kann ihn kein Job Worker aufgreifen.',
            zeile,
          });
          continue;
        }
        schritte.push({
          art: 'system',
          name: wert,
          jobType,
          zeile,
          ...(erzeugt ? { erzeugt } : {}),
          ...(marke ? { marke } : {}),
        });
      } else if (art === 'frage') {
        const wennKnoten = eintrag.get('wenn', true);
        const wenn = textWert(wennKnoten);
        if (wenn === undefined || wenn.trim() === '') {
          fehler.push({ text: 'Eine `frage:` braucht `wenn:` — die FEEL-Bedingung, an der sie sich entscheidet.', zeile });
          continue;
        }
        if (!wenn.startsWith('=')) {
          fehler.push({
            text: `\`wenn:\` muss ein FEEL-Ausdruck sein und mit \`=\` beginnen, also \`wenn: =${wenn}\`.`,
            zeile: zeileVon(wennKnoten, zeile),
          });
          continue;
        }
        const dann = leseZweig(eintrag, 'dann', zeile);
        const sonst = leseZweig(eintrag, 'sonst', zeile);
        if (dann.length === 0 && sonst.length === 0) {
          fehler.push({ text: 'Eine `frage:` braucht mindestens einen Zweig — `dann:` oder `sonst:`.', zeile });
          continue;
        }
        schritte.push({
          art: 'frage',
          name: wert,
          wenn,
          wennZeile: zeileVon(wennKnoten, zeile),
          dann,
          sonst,
          zeile,
          ...(marke ? { marke } : {}),
        });
      } else if (art === 'mensch') {
        schritte.push({ art, name: wert, zeile, ...(erzeugt ? { erzeugt } : {}), ...(marke ? { marke } : {}) });
      } else {
        schritte.push({ art, name: wert, zeile, ...(marke ? { marke } : {}) });
      }
    }

    // Was nach einem Schritt steht, der von selbst endet, kann kein Pfad erreichen.
    schritte.slice(0, -1).forEach((schritt, index) => {
      if (!endetVonSelbst([schritt])) return;
      if (schritt.art === 'ende') {
        fehler.push({ text: '`ende:` darf nur der letzte Schritt sein — nach dem Ende geht es nicht weiter.', zeile: schritt.zeile });
      } else if (schritt.art === 'sprung') {
        fehler.push({ text: '`weiter-bei:` darf nur der letzte Schritt sein — nach dem Sprung geht es nicht weiter.', zeile: schritt.zeile });
      } else {
        fehler.push({
          text: 'Nach dieser Verzweigung stehen Schritte, die kein Zweig erreichen kann — beide Zweige enden.',
          zeile: schritt.zeile,
        });
      }
    });

    return schritte;
  }

  let ablauf: Schritt[] = [];
  const ablaufKnoten = knotenVon('ablauf');
  if (ablaufKnoten === undefined) {
    fehler.push({ text: 'Es fehlt `ablauf:` — die Schritte des Prozesses.', zeile: 1 });
  } else if (!isSeq(ablaufKnoten)) {
    fehler.push({ text: '`ablauf:` muss eine Liste von Schritten sein.', zeile: zeileVon(ablaufKnoten) });
  } else if (ablaufKnoten.items.length === 0) {
    fehler.push({ text: '`ablauf:` ist leer — ein Prozess braucht mindestens einen Schritt.', zeile: zeileVon(ablaufKnoten) });
  } else {
    ablauf = leseFolge(ablaufKnoten);

    if (ablauf.length > 0 && !endetVonSelbst(ablauf)) {
      fehler.push({
        text: 'Der Ablauf muss mit `ende:` enden.',
        zeile: ablauf[ablauf.length - 1]!.zeile,
      });
    }
  }

  // Marken und Sprünge passen erst zusammen, wenn der ganze Baum gelesen ist:
  // ein `weiter-bei:` darf auch auf eine Marke zeigen, die weiter unten steht.
  const marken = new Map<string, number>();
  for (const schritt of alleSchritte(ablauf)) {
    if (schritt.art === 'sprung' || schritt.marke === undefined) continue;
    if (marken.has(schritt.marke.name)) {
      fehler.push({ text: `Die Marke \`${schritt.marke.name}\` ist schon vergeben.`, zeile: schritt.marke.zeile });
    } else {
      marken.set(schritt.marke.name, schritt.marke.zeile);
    }
  }
  for (const schritt of alleSchritte(ablauf)) {
    if (schritt.art !== 'sprung' || marken.has(schritt.marke)) continue;
    const bekannt = [...marken.keys()];
    fehler.push({
      text: `Es gibt keinen Schritt mit der Marke \`${schritt.marke}\`.${
        bekannt.length > 0 ? ` Bekannt sind: ${bekannt.join(', ')}.` : ''
      }`,
      zeile: schritt.zeile,
    });
  }

  if (fehler.length > 0) return { ok: false, fehler };
  return { ok: true, beschreibung: { prozess, name, start, ablauf } };
}
