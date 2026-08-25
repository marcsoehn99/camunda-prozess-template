import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { fuegeAufgabeHinzu, liesStruktur, verschiebeElement } from './struktur.ts';

const ausfuehren = promisify(execFile);

/**
 * Ein einzelner Rauchtest für die Hülle: liest sie eine Datei und schreibt sie eine.
 * Die Logik wird gegen den Renderer getestet, nicht hier.
 */
describe('CLI', () => {
  it('liest die Beschreibung und schreibt das Diagramm daneben', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'prozess-'));
    const quelle = join(ordner, 'freigabe.prozess.yaml');
    await writeFile(
      quelle,
      `prozess: freigabe
name: Freigabe
start:
  name: Start
ablauf:
  - mensch: Freigabe erteilen
  - ende: Fertig
`,
    );

    const { stdout } = await ausfuehren('node', ['src/cli.ts', quelle]);
    expect(stdout).toContain('Diagramm geschrieben');

    const struktur = await liesStruktur(await readFile(join(ordner, 'freigabe.bpmn'), 'utf8'));
    expect(struktur.prozessId).toBe('freigabe');
    expect(struktur.elemente).toHaveLength(3);
  }, 30_000);

  it('schreibt nichts und endet mit Fehlercode, wenn die Beschreibung abgelehnt wird', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'prozess-'));
    const quelle = join(ordner, 'kaputt.prozess.yaml');
    await writeFile(quelle, 'prozess: kaputt\nablauf:\n  - system: Buchen\n');

    const fehler = await ausfuehren('node', ['src/cli.ts', quelle]).catch((e) => e);
    expect(fehler.code).toBe(1);
    expect(fehler.stderr).toContain('kaputt.prozess.yaml:3');
    expect(fehler.stderr).toContain('Kein Diagramm geschrieben.');
    await expect(readFile(join(ordner, 'kaputt.bpmn'), 'utf8')).rejects.toThrow();
  }, 30_000);

  it('nimmt ein schon dort liegendes Diagramm als Layout-Vorlage — außer bei --layout-neu', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'prozess-'));
    const quelle = join(ordner, 'freigabe.prozess.yaml');
    const diagramm = join(ordner, 'freigabe.bpmn');
    await writeFile(quelle, 'prozess: freigabe\nablauf:\n  - mensch: Freigabe erteilen\n  - ende: Fertig\n');

    await ausfuehren('node', ['src/cli.ts', quelle]);
    await writeFile(diagramm, await verschiebeElement(await readFile(diagramm, 'utf8'), 'Task_FreigabeErteilen', 0, 240));
    const verschoben = (await liesStruktur(await readFile(diagramm, 'utf8'))).formen.get('Task_FreigabeErteilen');

    await ausfuehren('node', ['src/cli.ts', quelle]);
    expect((await liesStruktur(await readFile(diagramm, 'utf8'))).formen.get('Task_FreigabeErteilen'))
      .toEqual(verschoben);

    await ausfuehren('node', ['src/cli.ts', quelle, '--layout-neu']);
    expect((await liesStruktur(await readFile(diagramm, 'utf8'))).formen.get('Task_FreigabeErteilen'))
      .not.toEqual(verschoben);
  }, 30_000);

  it('liest das Glossar und schreibt neue Begriffe hinein', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'prozess-'));
    const quelle = join(ordner, 'freigabe.prozess.yaml');
    const glossar = join(ordner, 'CONTEXT.md');
    await writeFile(quelle, 'prozess: freigabe\nablauf:\n  - system: Bestätigung senden\n    job-type: bestaetigung-senden\n  - ende: Fertig\n');
    await writeFile(glossar, '# Test\n\n## Language\n');

    const erste = await ausfuehren('node', ['src/cli.ts', quelle, '--glossar', glossar]);
    expect(erste.stdout).toContain('Neue Begriffe');
    expect(erste.stdout).toContain('Bestätigung senden → bestaetigung-senden');
    expect(await readFile(glossar, 'utf8')).toContain('_Technischer Name_: `bestaetigung-senden`');

    const zweite = await ausfuehren('node', ['src/cli.ts', quelle, '--glossar', glossar]);
    expect(zweite.stdout).toContain('Neue Begriffe: keine');
  }, 30_000);

  it('hält bei einer strukturellen Handänderung an — bis --drift-verwerfen kommt', async () => {
    const ordner = await mkdtemp(join(tmpdir(), 'prozess-'));
    const quelle = join(ordner, 'freigabe.prozess.yaml');
    const diagramm = join(ordner, 'freigabe.bpmn');
    await writeFile(quelle, 'prozess: freigabe\nablauf:\n  - mensch: Freigabe erteilen\n  - ende: Fertig\n');

    await ausfuehren('node', ['src/cli.ts', quelle]);
    await writeFile(diagramm, await fuegeAufgabeHinzu(await readFile(diagramm, 'utf8'), 'Activity_0hand', 'Von Hand'));

    const fehler = await ausfuehren('node', ['src/cli.ts', quelle]).catch((e) => e);
    expect(fehler.code).toBe(1);
    expect(fehler.stderr).toContain('von Hand strukturell verändert');
    expect(fehler.stderr).toContain('Activity_0hand');
    expect(fehler.stderr).toContain('--drift-verwerfen');
    expect(await readFile(diagramm, 'utf8')).toContain('Activity_0hand');

    await ausfuehren('node', ['src/cli.ts', quelle, '--drift-verwerfen']);
    expect(await readFile(diagramm, 'utf8')).not.toContain('Activity_0hand');
  }, 30_000);
});
