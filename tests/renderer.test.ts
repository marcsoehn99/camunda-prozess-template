import { describe, expect, it } from 'vitest';
import { rendere, STANDARD_PLATTFORM_VERSION } from '../src/renderer.ts';
import { liesStruktur, ueberlappen } from './struktur.ts';

/** Derselbe Prozess wie `processes/smoke-test.bpmn`: Start, ein User Task, Ende. */
const SMOKE = `prozess: smoke-test
name: Smoke Test
start:
  name: Start
ablauf:
  - mensch: Freigabe erteilen
  - ende: Fertig
`;

async function erzeuge(beschreibung: string, plattformVersion?: string) {
  const ergebnis = await rendere({ beschreibung, ...(plattformVersion ? { plattformVersion } : {}) });
  return ergebnis;
}

describe('linearer Prozess', () => {
  it('erzeugt die beschriebenen Elemente in der beschriebenen Reihenfolge', async () => {
    const { diagramm, pruefung } = await erzeuge(SMOKE);
    expect(pruefung.fehler).toEqual([]);
    expect(diagramm).not.toBeNull();

    const struktur = await liesStruktur(diagramm!);
    expect(struktur.prozessId).toBe('smoke-test');
    expect(struktur.prozessName).toBe('Smoke Test');
    expect(struktur.elemente.map((e) => [e.typ, e.name])).toEqual([
      ['bpmn:StartEvent', 'Start'],
      ['bpmn:UserTask', 'Freigabe erteilen'],
      ['bpmn:EndEvent', 'Fertig'],
    ]);

    const [start, task, ende] = struktur.elemente;
    expect(struktur.fluesse.map((f) => [f.von, f.nach])).toEqual([
      [start!.id, task!.id],
      [task!.id, ende!.id],
    ]);
  });

  it('macht den User Task zu einem Camunda-User-Task, damit der Prozess startbar ist', async () => {
    const { diagramm } = await erzeuge(SMOKE);
    const struktur = await liesStruktur(diagramm!);
    expect(struktur.elemente.find((e) => e.typ === 'bpmn:UserTask')?.istCamundaUserTask).toBe(true);
  });

  it('liest sich ohne Warnung ein und gibt jedem Element ein Layout', async () => {
    const { diagramm } = await erzeuge(SMOKE);
    const struktur = await liesStruktur(diagramm!);

    expect(struktur.warnungen).toEqual([]);
    for (const element of struktur.elemente) {
      expect(struktur.formen.has(element.id), `${element.id} ohne Form`).toBe(true);
    }
    for (const fluss of struktur.fluesse) {
      expect(struktur.kanten.get(fluss.id)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('platziert die Elemente ohne Überlappung', async () => {
    const { diagramm } = await erzeuge(SMOKE);
    const struktur = await liesStruktur(diagramm!);
    const kaesten = [...struktur.formen.values()];

    for (let i = 0; i < kaesten.length; i += 1) {
      for (let j = i + 1; j < kaesten.length; j += 1) {
        expect(ueberlappen(kaesten[i]!, kaesten[j]!), `Kästen ${i} und ${j} überlappen`).toBe(false);
      }
    }
  });

  it('vergibt über Runden hinweg dieselben IDs', async () => {
    const erste = await liesStruktur((await erzeuge(SMOKE)).diagramm!);
    const zweite = await liesStruktur((await erzeuge(SMOKE)).diagramm!);
    expect(zweite.elemente.map((e) => e.id)).toEqual(erste.elemente.map((e) => e.id));
    expect(zweite.fluesse.map((f) => f.id)).toEqual(erste.fluesse.map((f) => f.id));
  });

  it('trennt gleichnamige Schritte über einen Zusatz an der ID', async () => {
    const { diagramm } = await erzeuge(`prozess: doppelt
ablauf:
  - mensch: Prüfen
  - mensch: Prüfen
  - ende: Fertig
`);
    const struktur = await liesStruktur(diagramm!);
    const ids = struktur.elemente.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('Task_Pruefen');
    expect(ids).toContain('Task_Pruefen_2');
  });
});

describe('Ziel-Ausführungsplattformversion', () => {
  it('stempelt die voreingestellte Version ins Diagramm', async () => {
    const struktur = await liesStruktur((await erzeuge(SMOKE)).diagramm!);
    expect(struktur.plattform).toBe('Camunda Cloud');
    expect(struktur.plattformVersion).toBe(STANDARD_PLATTFORM_VERSION);
  });

  it('lässt sich auf eine andere Version einstellen', async () => {
    const struktur = await liesStruktur((await erzeuge(SMOKE, '8.10.0')).diagramm!);
    expect(struktur.plattformVersion).toBe('8.10.0');
  });
});

describe('der Linter läuft ungefragt mit', () => {
  it('schreibt kein Diagramm, wenn er einen Fehler meldet, und zeigt auf die Beschreibung', async () => {
    // 8.4.0 kennt den Camunda-User-Task noch nicht — der Linter muss das melden.
    const { diagramm, pruefung } = await erzeuge(SMOKE, '8.4.0');

    expect(diagramm).toBeNull();
    expect(pruefung.fehler).toHaveLength(1);
    expect(pruefung.fehler[0]!.text).toMatch(/8\.5/);
    // Zeile 6 ist `  - mensch: Freigabe erteilen`.
    expect(pruefung.fehler[0]!.zeile).toBe(6);
  });

  it('lässt Warnungen durch, ohne das Diagramm zurückzuhalten', async () => {
    const { diagramm, pruefung } = await erzeuge(SMOKE);
    expect(diagramm).not.toBeNull();
    expect(pruefung.warnungen.map((w) => w.text)).toContain('A <User Task> should have a defined <Form>');
    expect(pruefung.warnungen[0]!.zeile).toBe(6);
  });
});

describe('das Schema lehnt ab, statt ersatzweise zu rendern', () => {
  const abgelehnt = async (beschreibung: string) => {
    const ergebnis = await rendere({ beschreibung });
    expect(ergebnis.diagramm).toBeNull();
    expect(ergebnis.pruefung.fehler.length).toBeGreaterThan(0);
    return ergebnis.pruefung.fehler;
  };

  it('kennt `gruppe:` noch nicht und sagt das, statt es wegzulassen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: Freigabe erteilen
    gruppe: Einkauf
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/Unbekannter Schlüssel `gruppe`/);
    expect(fehler[0]!.zeile).toBe(4);
  });

  it('verlangt `prozess:`', async () => {
    const fehler = await abgelehnt(`ablauf:
  - ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/prozess/);
  });

  it('verlangt einen Ablauf, der mit `ende:` endet', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: Freigabe erteilen
`);
    expect(fehler[0]!.text).toMatch(/muss mit `ende:` enden/);
    expect(fehler[0]!.zeile).toBe(3);
  });

  it('lässt nach `ende:` nichts mehr folgen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - ende: Fertig
  - mensch: Zu spät
`);
    expect(fehler[0]!.text).toMatch(/nur der letzte Schritt/);
    expect(fehler[0]!.zeile).toBe(3);
  });

  it('meldet kaputtes YAML mit Zeile', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: "offen
`);
    expect(fehler[0]!.zeile).toBeGreaterThanOrEqual(3);
  });

  it('nimmt keinen Schritt mit zwei Bedeutungen', async () => {
    const fehler = await abgelehnt(`prozess: p
ablauf:
  - mensch: Freigabe erteilen
    ende: Fertig
`);
    expect(fehler[0]!.text).toMatch(/nur einen der Schlüssel/);
  });
});

describe('die übrigen Rückgaben des Seams', () => {
  it('meldet ohne zu vergebende Namen keine neuen Begriffe und keinen Drift', async () => {
    const ergebnis = await rendere({
      beschreibung: SMOKE,
      vorherigesDiagramm: '<egal/>',
      glossar: '# Glossar',
    });
    expect(ergebnis.neueBegriffe).toEqual([]);
    expect(ergebnis.drift).toEqual({ istDrift: false, abweichungen: [] });
  });
});
