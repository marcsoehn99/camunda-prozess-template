import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { deploye } from '../src/deploy.ts';

/**
 * Die Ausgaben in diesen Tests sind Mitschriften echter `c8ctl`-Läufe (v3.3.0) gegen einen
 * laufenden Cluster, einen toten Port und ein absichtlich kaputtes Diagramm. Sie werden nicht
 * nachgebildet, sondern zitiert — sonst prüft der Test nur die eigene Vorstellung.
 */
/** Die Statuszeilen schreibt `c8ctl` nach stderr, die Tabelle der Ressourcen nach stdout. */
const ERFOLG_STDERR = "{\"status\":\"info\",\"message\":\"Deploying 1 resource(s)...\"}\n{\"status\":\"success\",\"message\":\"Deployment successful\",\"key\":\"2251799813710224\"}";
const ERFOLG_STDOUT = "[\n  {\n    \"File\": \"smoke-test.bpmn\",\n    \"Type\": \"Process\",\n    \"ID\": \"smoke-test\",\n    \"Version\": 1,\n    \"Key\": \"2251799813710106\"\n  }\n]\n";

const ABGELEHNT = "{\"status\":\"info\",\"message\":\"Deploying 1 resource(s)...\"}\n{\"status\":\"error\",\"message\":\"Deployment failed\",\"error\":\"INVALID_ARGUMENT\",\"stack\":\"Error: INVALID_ARGUMENT\\n    at handleDeploymentError (file:///opt/homebrew/lib/node_modules/@camunda8/cli/dist/commands/helpers/deploy-helpers.js:788:39)\"}\n{\"type\":\"message\",\"message\":\"\\n  Command 'CREATE' rejected with code 'INVALID_ARGUMENT': Expected to deploy new resources, but encountered the following errors:\\n  \\ud83d\\udcc4 'kaputt.bpmn': - Element: kaputt\\n     \\u274c ERROR: Must have at least one start event\"}\n{\"type\":\"message\",\"message\":\"\\ud83d\\udcc1 Resources attempted (1):\"}";

const KEIN_CLUSTER = "{\"status\":\"warning\",\"message\":\"Could not reach the server to check its version (topology call failed).\"}\n{\"status\":\"info\",\"message\":\"Deploying 1 resource(s)...\"}\n{\"status\":\"error\",\"message\":\"Deployment failed\",\"error\":\"fetch failed\",\"url\":\"http://localhost:8080/v2\",\"stack\":\"Error: fetch failed\\n    at handleDeploymentError (file:///opt/homebrew/lib/node_modules/@camunda8/cli/dist/commands/helpers/deploy-helpers.js:788:39)\",\"hint\":\"Hint: Is the local cluster running? Start it with: c8ctl start c8-cluster\"}";

describe('Deployen auf Zuruf', () => {
  it('meldet Erfolg mit Prozess-ID und Version', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 0, stdout: ERFOLG_STDOUT, stderr: ERFOLG_STDERR }),
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.meldung).toContain('smoke-test');
    expect(ergebnis.meldung).toContain('Version 1');
  });

  it('meldet Misserfolg und zeigt dabei die Meldung des Brokers', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/kaputt.bpmn',
      kommando: async () => ({ code: 1, stdout: '', stderr: ABGELEHNT }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain('Must have at least one start event');
    expect(ergebnis.meldung).not.toContain('deploy-helpers.js');
  });

  it('sagt beim toten Cluster genau das, statt den Netzwerkfehler durchzureichen', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 1, stdout: '', stderr: KEIN_CLUSTER }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain('Kein Cluster erreichbar');
    expect(ergebnis.meldung).toContain('http://localhost:8080/v2');
    expect(ergebnis.meldung).not.toContain('fetch failed');
  });

  it('sagt es, wenn die Camunda-CLI gar nicht installiert ist', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => {
        throw Object.assign(new Error('spawn c8ctl ENOENT'), { code: 'ENOENT' });
      },
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain('c8ctl');
    expect(ergebnis.meldung).toContain('@camunda8/cli');
    expect(ergebnis.meldung).not.toContain('ENOENT');
  });

  it('hält einen Fehlschlag ohne verwertbare Ausgabe nicht für Erfolg', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 1, stdout: '', stderr: 'Unknown flag: --hoppla\n' }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain('Unknown flag: --hoppla');
  });

  it('liest die Ressourcen auch, wenn die Tabelle auf einer Zeile steht', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({
        code: 0,
        stdout: '[{"File":"smoke-test.bpmn","Type":"Process","ID":"smoke-test","Version":3}]\n',
        stderr: ERFOLG_STDERR,
      }),
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.meldung).toBe('Deployt: smoke-test (Version 3)');
  });

  it('meldet keinen Erfolg, wenn nichts genannt wurde, was jetzt beim Broker liegt', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 0, stdout: '', stderr: ERFOLG_STDERR }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).not.toContain('Deployt:');
    expect(ergebnis.meldung).toContain('keine deployte Ressource');
  });

  it('nennt eine Ressource ohne ID beim Dateinamen statt „undefined"', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 0, stdout: '[{"File":"smoke-test.bpmn","Type":"Process"}]', stderr: '' }),
    });

    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.meldung).toBe('Deployt: smoke-test.bpmn');
  });

  it.each([
    ['ein abgewiesener Port', '{"status":"error","message":"Deployment failed","error":"connect ECONNREFUSED 127.0.0.1:8080","url":"http://localhost:8080/v2"}'],
    ['eine umschriebene Fetch-Meldung', '{"status":"error","message":"Deployment failed","error":"TypeError: fetch failed","url":"http://localhost:8080/v2"}'],
    ['nur der Hinweis der CLI', '{"status":"error","message":"Deployment failed","error":"AggregateError","url":"http://localhost:8080/v2","hint":"Hint: Is the local cluster running? Start it with: c8ctl start c8-cluster"}'],
  ])('erkennt den toten Cluster auch, wenn %s dasteht', async (_fall, zeile) => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 1, stdout: '', stderr: zeile }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).toContain('Kein Cluster erreichbar');
    expect(ergebnis.meldung).toContain('http://localhost:8080/v2');
  });

  it('sagt bei einem Fehler ohne lesbaren Text weder „[object Object]" noch „undefined"', async () => {
    const ergebnis = await deploye({
      diagrammPfad: 'processes/smoke-test.bpmn',
      kommando: async () => ({ code: 1, stdout: '', stderr: '{"status":"error","error":{"code":13}}' }),
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.meldung).not.toContain('[object Object]');
    expect(ergebnis.meldung).not.toContain('undefined');
  });
});

/**
 * Ein Rauchtest für die Hülle — ohne Cluster. Dass sie richtig deployt, wird gegen den
 * laufenden Cluster von Hand geprüft; hier steht nur, dass sie ohne ihn niemanden anruft.
 */
describe('prozess-deploy', () => {
  const ausfuehren = promisify(execFile);

  it('sagt es, wenn zu dem genannten Prozess gar kein Diagramm liegt', async () => {
    const fehler = await ausfuehren('node', ['src/deploy-cli.ts', 'gibtsnicht']).catch((e) => e);

    expect(fehler.code).toBe(2);
    expect(fehler.stderr).toContain('Kein Diagramm unter processes/gibtsnicht.bpmn');
    expect(fehler.stderr).toContain('npm run prozess');
  }, 30_000);

  it('lässt kein Profil stillschweigend unter den Tisch fallen', async () => {
    const fehler = await ausfuehren('node', ['src/deploy-cli.ts', 'smoke-test', '--profil']).catch((e) => e);

    expect(fehler.code).toBe(2);
    expect(fehler.stderr).toContain('--profil braucht einen Profilnamen');
  }, 30_000);

  it('nimmt einen unbekannten Schalter nicht für einen Prozessnamen', async () => {
    const fehler = await ausfuehren('node', ['src/deploy-cli.ts', 'smoke-test', '--hoppla']).catch((e) => e);

    expect(fehler.code).toBe(2);
    expect(fehler.stderr).toContain('Unbekannte Angabe: --hoppla');
  }, 30_000);
});
