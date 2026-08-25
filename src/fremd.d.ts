// Handgeschriebene Typen für die bpmn.io-Pakete, die keine eigenen mitbringen.
// Nur das, was der Renderer benutzt.

declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(pakete?: Record<string, unknown>);
    create(typ: string, eigenschaften?: Record<string, unknown>): any;
    toXML(element: unknown, optionen?: { format?: boolean }): Promise<{ xml: string }>;
    fromXML(xml: string): Promise<{ rootElement: any; warnings: unknown[] }>;
  }
}

declare module 'bpmn-auto-layout' {
  export function layoutProcess(xml: string): Promise<string>;
}

declare module 'zeebe-bpmn-moddle/resources/zeebe.json' {
  const schema: Record<string, unknown>;
  export default schema;
}

declare module 'modeler-moddle/resources/modeler.json' {
  const schema: Record<string, unknown>;
  export default schema;
}
