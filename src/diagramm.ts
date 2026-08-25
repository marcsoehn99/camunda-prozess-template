import { layoutProcess } from 'bpmn-auto-layout';
import type { Beschreibung, ElementSchritt, ErgebnisSchritt, FrageSchritt, Schritt } from './beschreibung.ts';
import { bezeichner, eindeutig } from './bezeichner.ts';
import { neuesModdle } from './moddle.ts';

export const AUSFUEHRUNGSPLATTFORM = 'Camunda Cloud';

export type Bauergebnis = {
  xml: string;
  /** Element-ID → Zeile in der Prozess-Beschreibung. Trägt Meldungen zurück an ihre Stelle. */
  herkunft: Map<string, number>;
};

type ModdleElement = {
  id?: string;
  set(name: string, wert: unknown): void;
  get(name: string): any;
};

/**
 * Ein Ausgang, der noch auf sein Ziel wartet.
 *
 * Zweige, die nicht mit `ende:` oder `weiter-bei:` schließen, **fallen durch**: ihr Ausgang
 * bleibt offen und wird an den nächsten Schritt hinter dem `frage:`-Block gehängt.
 */
type Auslass = {
  von: ModdleElement;
  /** FEEL-Bedingung, wenn der Ausgang ein Zweig eines Gateways ist. */
  bedingung?: string;
  beschriftung?: string;
  /** Ob dieser Ausgang der Standardpfad seines Gateways wird. */
  istStandard?: boolean;
  zeile: number;
};

/**
 * Erzeugt aus der Prozess-Beschreibung ein Diagramm mit Layout.
 *
 * Das Layout kommt aus `bpmn-auto-layout`; die Beschreibung enthält niemals Koordinaten.
 */
export async function baueDiagramm(
  beschreibung: Beschreibung,
  plattformVersion: string,
): Promise<Bauergebnis> {
  const moddle = neuesModdle();
  const herkunft = new Map<string, number>();
  const vergeben = new Set<string>();

  const knoten: ModdleElement[] = [];
  const fluesse: ModdleElement[] = [];
  /** Marke → Element, das sie trägt. Ziele von `weiter-bei:`. */
  const marken = new Map<string, ModdleElement>();
  /** Sprünge, deren Ziel erst feststeht, wenn der ganze Ablauf gebaut ist. */
  const spruenge: { auslaesse: Auslass[]; marke: string }[] = [];

  function neu(typ: string, id: string, zeile: number, eigenschaften: Record<string, unknown>): ModdleElement {
    const element = moddle.create(typ, { id, ...eigenschaften }) as ModdleElement;
    herkunft.set(id, zeile);
    knoten.push(element);
    return element;
  }

  function verbinde(auslass: Auslass, ziel: ModdleElement): void {
    const id = eindeutig(`Fluss_${auslass.von.id}__${ziel.id}`, vergeben);
    const fluss = moddle.create('bpmn:SequenceFlow', {
      id,
      sourceRef: auslass.von,
      targetRef: ziel,
      ...(auslass.beschriftung ? { name: auslass.beschriftung } : {}),
    }) as ModdleElement;
    if (auslass.bedingung !== undefined) {
      fluss.set('conditionExpression', moddle.create('bpmn:FormalExpression', { body: auslass.bedingung }));
    }
    herkunft.set(id, auslass.zeile);
    auslass.von.get('outgoing').push(fluss);
    ziel.get('incoming').push(fluss);
    fluesse.push(fluss);
    if (auslass.istStandard) auslass.von.set('default', fluss);
  }

  const verbindeAlle = (auslaesse: Auslass[], ziel: ModdleElement): void => {
    for (const auslass of auslaesse) verbinde(auslass, ziel);
  };

  /**
   * Die Ausgabe-Zuordnung eines Schritts, der etwas erzeugt.
   *
   * Sie ist bewusst gleichnamig — `=freigabe` nach `freigabe`. Ihr Zweck ist nicht das
   * Umbenennen, sondern das Eingrenzen: liegt eine Ausgabe-Zuordnung an, läuft von allem, was
   * der Schritt zurückgibt, genau diese eine Variable weiter. Genau das sagt `erzeugt:`.
   */
  function ausgabe(schritt: ErgebnisSchritt): ModdleElement[] {
    if (schritt.erzeugt === undefined) return [];
    return [
      moddle.create('zeebe:IoMapping', {
        outputParameters: [
          moddle.create('zeebe:Output', { source: `=${schritt.erzeugt.name}`, target: schritt.erzeugt.name }),
        ],
      }) as ModdleElement,
    ];
  }

  function erzeugeElement(schritt: ElementSchritt): ModdleElement {
    if (schritt.art === 'mensch') {
      const element = neu('bpmn:UserTask', eindeutig(`Task_${bezeichner(schritt.name)}`, vergeben), schritt.zeile, {
        name: schritt.name,
      });
      element.set(
        'extensionElements',
        moddle.create('bpmn:ExtensionElements', { values: [moddle.create('zeebe:UserTask'), ...ausgabe(schritt)] }),
      );
      return element;
    }
    if (schritt.art === 'system') {
      const element = neu('bpmn:ServiceTask', eindeutig(`Task_${bezeichner(schritt.name)}`, vergeben), schritt.zeile, {
        name: schritt.name,
      });
      element.set(
        'extensionElements',
        moddle.create('bpmn:ExtensionElements', {
          values: [moddle.create('zeebe:TaskDefinition', { type: schritt.jobType }), ...ausgabe(schritt)],
        }),
      );
      return element;
    }
    if (schritt.art === 'frage') {
      return neu('bpmn:ExclusiveGateway', eindeutig(`Frage_${bezeichner(schritt.name)}`, vergeben), schritt.zeile, {
        name: schritt.name,
      });
    }
    return neu('bpmn:EndEvent', eindeutig(`Ende_${bezeichner(schritt.name)}`, vergeben), schritt.zeile, {
      name: schritt.name,
    });
  }

  /**
   * Baut eine Schrittfolge und liefert die Ausgänge, die danach noch offen sind.
   * `offen` sind die Ausgänge, die in den ersten Schritt dieser Folge münden.
   */
  function baueFolge(schritte: Schritt[], offen: Auslass[]): Auslass[] {
    for (const schritt of schritte) {
      if (schritt.art === 'sprung') {
        spruenge.push({ auslaesse: offen, marke: schritt.marke });
        return [];
      }

      const element = erzeugeElement(schritt);
      verbindeAlle(offen, element);
      if (schritt.marke !== undefined) marken.set(schritt.marke.name, element);

      offen = schritt.art === 'frage'
        ? baueVerzweigung(schritt, element)
        : [{ von: element, zeile: schritt.zeile }];

      // Nach `ende:` gibt es keinen offenen Ausgang mehr; das Schema lässt dort nichts folgen.
      if (schritt.art === 'ende') return [];
    }
    return offen;
  }

  /**
   * Baut beide Zweige und führt sie wieder zusammen. Bleibt mehr als ein Ausgang offen,
   * entsteht ein zusammenführendes Gateway — ein Knoten, der in der Beschreibung keine Zeile
   * hat. Seine ID leitet sich deshalb aus der `frage:` ab, damit sie über Runden hält.
   */
  function baueVerzweigung(schritt: FrageSchritt, gateway: ModdleElement): Auslass[] {
    const dannOffen = baueFolge(schritt.dann, [
      { von: gateway, bedingung: schritt.wenn, beschriftung: 'ja', zeile: schritt.wennZeile },
    ]);
    const sonstOffen = baueFolge(schritt.sonst, [
      { von: gateway, istStandard: true, beschriftung: 'nein', zeile: schritt.zeile },
    ]);

    const zusammen = [...dannOffen, ...sonstOffen];
    if (zusammen.length < 2) return zusammen;

    const id = eindeutig(`Zusammenfuehrung_${bezeichner(schritt.name)}`, vergeben);
    const join = neu('bpmn:ExclusiveGateway', id, schritt.zeile, {});
    verbindeAlle(zusammen, join);
    return [{ von: join, zeile: schritt.zeile }];
  }

  const startId = eindeutig(
    beschreibung.start.name ? `Start_${bezeichner(beschreibung.start.name)}` : 'Start_1',
    vergeben,
  );
  const start = neu('bpmn:StartEvent', startId, beschreibung.start.zeile, {
    ...(beschreibung.start.name ? { name: beschreibung.start.name } : {}),
  });

  baueFolge(beschreibung.ablauf, [{ von: start, zeile: beschreibung.start.zeile }]);

  for (const sprung of spruenge) {
    // Die Marke ist beim Lesen geprüft worden; hier kann sie nur noch existieren.
    verbindeAlle(sprung.auslaesse, marken.get(sprung.marke)!);
  }

  const prozess = moddle.create('bpmn:Process', {
    id: beschreibung.prozess,
    ...(beschreibung.name ? { name: beschreibung.name } : {}),
    isExecutable: true,
    flowElements: [...knoten, ...fluesse],
  });

  const definitions = moddle.create('bpmn:Definitions', {
    id: `Definitions_${bezeichner(beschreibung.prozess)}`,
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    exporter: 'camundatest-renderer',
    exporterVersion: '1',
    rootElements: [prozess],
  }) as ModdleElement;
  definitions.set('modeler:executionPlatform', AUSFUEHRUNGSPLATTFORM);
  definitions.set('modeler:executionPlatformVersion', plattformVersion);

  const { xml } = await moddle.toXML(definitions, { format: true });
  const gelayoutet = await layoutProcess(xml);

  return { xml: gelayoutet, herkunft };
}
