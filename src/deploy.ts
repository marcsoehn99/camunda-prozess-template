/**
 * Deployen auf Zuruf. Kein Tor im Erzeugen — ein eigener Befehl, den der Autor ausspricht.
 *
 * Es werden keine eigenen Aufrufe gegen die REST-Schnittstelle geschrieben: das Deployen
 * läuft über die offizielle CLI `c8ctl`, weil der eingebaute MCP-Server es nicht anbietet.
 * Diese Funktion ruft nicht selbst, sie deutet: was `c8ctl` ausgibt, wird hier zu einem Satz,
 * den der Autor lesen kann. Der Aufruf selbst kommt als `kommando` herein.
 */

/** Die offizielle Camunda-CLI. Eigene REST-Aufrufe werden ausdrücklich nicht geschrieben. */
export const CLI = 'c8ctl';

export type Kommandolauf = { code: number; stdout: string; stderr: string };

/** Führt `c8ctl` mit den gegebenen Argumenten aus. Die einzige Stelle, die das Netz berührt. */
export type Kommando = (argumente: string[]) => Promise<Kommandolauf>;

export type Deployergebnis = {
  ok: boolean;
  /** Was dem Autor gesagt wird — im Fehlerfall die Meldung des Brokers, nie ein Stacktrace. */
  meldung: string;
};

type Zeile = Record<string, unknown>;

type Ressource = { File?: string; ID?: string; Version?: number; Type?: string };

/** `c8ctl --json` schreibt eine JSON-Zeile je Schritt, dazwischen mehrzeilige Tabellen. */
function jsonZeilen(ausgabe: string): Zeile[] {
  const zeilen: Zeile[] = [];
  for (const roh of ausgabe.split('\n')) {
    const text = roh.trim();
    if (!text.startsWith('{')) continue;
    try {
      zeilen.push(JSON.parse(text) as Zeile);
    } catch {
      // Keine JSON-Zeile, sondern Fließtext. Für die Deutung uninteressant.
    }
  }
  return zeilen;
}

/**
 * Die Tabelle am Ende eines erfolgreichen Laufs: was tatsächlich beim Broker liegt. Sie steht
 * als eigener JSON-Block, nicht in den `--json`-Statuszeilen. Ob sie hübsch über mehrere Zeilen
 * gesetzt ist oder auf einer einzigen steht, ist Sache der CLI — beides wird gelesen. Die
 * Statuszeilen beginnen mit `{`, kommen sich mit der `[`-Tabelle also nicht in die Quere.
 */
function deployteRessourcen(ausgabe: string): Ressource[] {
  const zeilen = ausgabe.split('\n');
  const beginn = zeilen.findIndex((z) => z.trim().startsWith('['));
  if (beginn === -1) return [];
  const ende = zeilen.findLastIndex((z, i) => i >= beginn && z.trim().endsWith(']'));
  if (ende === -1) return [];
  try {
    const gelesen: unknown = JSON.parse(zeilen.slice(beginn, ende + 1).join('\n'));
    return Array.isArray(gelesen) ? (gelesen as Ressource[]) : [];
  } catch {
    return [];
  }
}

/** Wie eine deployte Ressource genannt wird. Fehlt die ID, sagt der Dateiname immer noch etwas. */
function benennung(ressource: Ressource): string {
  const name =
    typeof ressource.ID === 'string' && ressource.ID !== ''
      ? ressource.ID
      : typeof ressource.File === 'string' && ressource.File !== ''
        ? ressource.File
        : 'unbenannte Ressource';
  return typeof ressource.Version === 'number' ? `${name} (Version ${ressource.Version})` : name;
}

/**
 * Was der Broker abgelehnt hat, steht als Fließtext in einer eigenen `message`-Zeile hinter
 * dem Fehler — der Fehler selbst trägt nur `INVALID_ARGUMENT` und einen Stacktrace, der den
 * Autor nichts angeht.
 */
function brokermeldung(zeilen: Zeile[]): string | null {
  const zeile = zeilen.find((z) => typeof z.message === 'string' && z.message.includes('rejected with code'));
  return zeile === undefined ? null : String(zeile.message).trim();
}

/**
 * Ein toter Cluster ist keine Ablehnung. Er verrät sich an der Wortwahl der Fetch-API, am
 * abgewiesenen Port oder am Hinweis, den `c8ctl` selbst mitschickt — die Schreibweise des
 * einen Falls ist zu wenig, um sich darauf zu verlassen.
 */
function keinClusterErreichbar(fehler: Zeile): boolean {
  const text = typeof fehler.error === 'string' ? fehler.error : '';
  const netzwortlaut = /fetch failed|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|timed? ?out/i;
  if (netzwortlaut.test(text)) return true;
  return typeof fehler.hint === 'string' && /cluster (is )?running|c8ctl start/i.test(fehler.hint);
}

/** Der Fehlertext, den der Autor lesen soll — nie `[object Object]`, nie das Wort `undefined`. */
function fehlertext(fehler: Zeile): string {
  for (const feld of [fehler.error, fehler.message]) {
    if (typeof feld === 'string' && feld.trim() !== '') return feld.trim();
  }
  return `${CLI} meldete einen Fehler ohne lesbaren Text.`;
}

export async function deploye(eingabe: {
  diagrammPfad: string;
  kommando: Kommando;
}): Promise<Deployergebnis> {
  let lauf: Kommandolauf;
  try {
    lauf = await eingabe.kommando(['deploy', eingabe.diagrammPfad, '--json', '--yes']);
  } catch (fehler) {
    if ((fehler as { code?: string }).code === 'ENOENT') {
      return {
        ok: false,
        meldung:
          `${CLI} ist nicht installiert. Nachholen mit: npm install -g @camunda8/cli — ` +
          'für alles außer dem Deployen wird es nicht gebraucht.',
      };
    }
    throw fehler;
  }
  const ausgabe = lauf.stdout + '\n' + lauf.stderr;
  const zeilen = jsonZeilen(ausgabe);

  const fehler = zeilen.find((z) => z.status === 'error');
  if (fehler !== undefined) {
    // Da war niemand — und der Autor soll das lesen, nicht die Wortwahl der Fetch-API.
    if (keinClusterErreichbar(fehler)) {
      const adresse = typeof fehler.url === 'string' ? fehler.url : 'der eingestellten Adresse';
      return {
        ok: false,
        meldung:
          `Kein Cluster erreichbar unter ${adresse}. ` +
          'Nichts deployt — erzeugen und prüfen laufen davon unberührt weiter.',
      };
    }
    return { ok: false, meldung: brokermeldung(zeilen) ?? fehlertext(fehler) };
  }

  // Ein Fehlschlag, den `c8ctl` nicht als JSON-Zeile ausdrückt, bleibt ein Fehlschlag.
  if (lauf.code !== 0) {
    return { ok: false, meldung: (lauf.stderr + lauf.stdout).trim() || `${CLI} endete mit Code ${lauf.code}.` };
  }

  // Kein Fehler und trotzdem keine genannte Ressource heißt nicht Erfolg, sondern Ungewissheit.
  // Ein `Deployt:` ohne etwas dahinter wäre eine Zusage, die niemand geprüft hat.
  const ressourcen = deployteRessourcen(ausgabe);
  if (ressourcen.length === 0) {
    const roh = ausgabe.trim();
    return {
      ok: false,
      meldung:
        `${CLI} meldete keinen Fehler, nannte aber keine deployte Ressource — ob etwas beim Broker liegt, ` +
        `ist damit offen.${roh === '' ? '' : `\n${roh}`}`,
    };
  }

  return {
    ok: true,
    meldung: `Deployt: ${ressourcen.map(benennung).join(', ')}`,
  };
}
