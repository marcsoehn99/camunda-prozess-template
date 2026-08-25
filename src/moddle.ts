import { BpmnModdle } from 'bpmn-moddle';
import zeebeSchema from 'zeebe-bpmn-moddle/resources/zeebe.json' with { type: 'json' };
import modelerSchema from 'modeler-moddle/resources/modeler.json' with { type: 'json' };
import prozessSchema from './prozess-schema.json' with { type: 'json' };

/**
 * Ein Moddle mit genau den Erweiterungen, die dieses Repo benutzt: `zeebe:` für die
 * Ausführung, `modeler:` für die Ziel-Ausführungsplattform, `prozess:` für die Signatur,
 * an der die Drift-Erkennung erkennt, was zuletzt erzeugt wurde.
 *
 * Es gibt nur diese eine Stelle — wer ein Diagramm liest oder schreibt, holt es hier.
 */
export function neuesModdle(): BpmnModdle {
  return new BpmnModdle({ zeebe: zeebeSchema, modeler: modelerSchema, prozess: prozessSchema });
}
