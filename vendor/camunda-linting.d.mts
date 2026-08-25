// Handgeschriebene Typen für das gebündelte `@camunda/linting` (siehe `npm run build:linter`).
// Nur das, was der Renderer benutzt.

export type LintBericht = {
  id: string;
  message: string;
  category: 'error' | 'warn' | 'info';
  rule: string;
  name?: string;
};

export declare class Linter {
  constructor(optionen?: { modeler?: 'desktop' | 'web' });
  lint(inhalt: string): Promise<LintBericht[]>;
}
