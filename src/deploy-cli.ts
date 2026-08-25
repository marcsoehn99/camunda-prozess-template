#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { CLI, deploye } from './deploy.ts';
import { diagrammPfadFuer } from './pfade.ts';

/**
 * Dünne Hülle um das Deployen: Pfad auflösen, `c8ctl` rufen, Ergebnis ausgeben.
 * Ein eigener Befehl auf Zuruf — kein Erzeugen wartet darauf, kein Lauf hängt daran.
 */

const HILFE = `prozess-deploy <name | beschreibung.prozess.yaml | diagramm.bpmn> [--profil <name>]

Schickt das Diagramm eines Prozesses an den eingestellten Cluster und sagt, ob es angenommen
wurde. Es wird nichts erzeugt und nichts geprüft — deployt wird, was gerade als Diagramm dort
liegt.

Das passiert nur auf ausdrücklichen Zuruf. Kein anderer Befehl setzt einen laufenden Cluster
voraus.`;

const liegtDa = (pfad: string): Promise<boolean> => access(pfad).then(() => true, () => false);

/**
 * Ein bloßer Name meint den Prozess gleichen Namens unter processes/ — es sei denn, die genannte
 * Datei liegt wirklich da, wo sie genannt wurde. Sonst fände `prozess-deploy meins.bpmn` die
 * Datei nicht, die direkt daneben liegt.
 */
async function pfadFuer(name: string): Promise<string> {
  const wieGenannt = diagrammPfadFuer(name);
  if (name.includes('/') || (await liegtDa(wieGenannt))) return wieGenannt;
  return diagrammPfadFuer(`processes/${name}`);
}

async function main(argv: string[]): Promise<number> {
  const positional: string[] = [];
  let profil: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(HILFE);
      return 0;
    } else if (arg === '--profil' || arg === '--profile') {
      // Ohne Wert oder mit dem nächsten Schalter als Wert würde stillschweigend gegen den
      // Standard-Cluster deployt — mit einer Erfolgsmeldung, die den falschen Cluster meint.
      const wert = argv[++i];
      if (wert === undefined || wert.startsWith('-')) {
        console.error(`${arg} braucht einen Profilnamen.`);
        return 2;
      }
      profil = wert;
    } else if (arg.startsWith('-')) {
      // Ein unbekannter Schalter darf nicht als Prozessname durchrutschen.
      console.error(`Unbekannte Angabe: ${arg}\n\n${HILFE}`);
      return 2;
    } else {
      positional.push(arg);
    }
  }

  const genannt = positional[0];
  if (genannt === undefined) {
    console.error(HILFE);
    return 2;
  }

  const diagrammPfad = await pfadFuer(genannt);
  if (!(await liegtDa(diagrammPfad))) {
    console.error(`Kein Diagramm unter ${diagrammPfad}. Erst erzeugen: npm run prozess -- <beschreibung>`);
    return 2;
  }

  const ergebnis = await deploye({
    diagrammPfad,
    kommando: (argumente) =>
      new Promise((aufloesen, ablehnen) => {
        const alle = profil === undefined ? argumente : [...argumente, '--profile', profil];
        execFile(CLI, alle, (fehler, stdout, stderr) => {
          if (fehler === null) return aufloesen({ code: 0, stdout, stderr });
          const code: unknown = (fehler as { code?: unknown }).code;
          if (code === 'ENOENT') return ablehnen(fehler);
          // Fehlschläge unterhalb des Prozesses (EACCES, gesprengter maxBuffer) tragen einen
          // Namen statt einer Zahl und keine Ausgabe. `Code NaN` wäre für den Autor nichts.
          if (typeof code === 'number') return aufloesen({ code, stdout, stderr });
          aufloesen({ code: 1, stdout, stderr: `${stderr}${CLI}: ${fehler.message}\n` });
        });
      }),
  });

  if (!ergebnis.ok) {
    console.error(ergebnis.meldung);
    return 1;
  }
  console.log(ergebnis.meldung);
  return 0;
}

// Was hier durchschlägt, ist ein Fehler der Hülle. Der Autor bekommt einen Satz, keinen Stacktrace.
process.exitCode = await main(process.argv.slice(2)).catch((fehler: unknown) => {
  console.error(fehler instanceof Error ? fehler.message : String(fehler));
  return 1;
});
