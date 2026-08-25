import { basename, dirname, join } from 'node:path';

/**
 * Wo das Diagramm eines Prozesses liegt: neben seiner Prozess-Beschreibung, gleicher Name.
 * Wird ein Diagramm selbst genannt, bleibt es, was es ist.
 */
export function diagrammPfadFuer(pfad: string): string {
  if (/\.bpmn$/i.test(pfad)) return pfad;
  const name = basename(pfad).replace(/\.prozess\.(ya?ml)$/i, '').replace(/\.(ya?ml)$/i, '');
  return join(dirname(pfad), `${name}.bpmn`);
}
