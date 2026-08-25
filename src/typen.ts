/** Eine Meldung zeigt immer auf die Prozess-Beschreibung, nie auf erzeugtes XML. */
export type Meldung = {
  text: string;
  /** 1-basierte Zeile in der Prozess-Beschreibung, sofern zuordenbar. */
  zeile?: number;
};

export type Pruefergebnis = {
  fehler: Meldung[];
  warnungen: Meldung[];
};

export type Driftergebnis = {
  istDrift: boolean;
  /** Was am vorgefundenen Diagramm von der Prozess-Beschreibung abweicht. */
  abweichungen: Meldung[];
};

export type RenderEingabe = {
  /** Inhalt der Prozess-Beschreibung, nicht ihr Pfad. */
  beschreibung: string;
  /** Inhalt des vorherigen Diagramms. Liefert die Positionen, die übernommen werden. */
  vorherigesDiagramm?: string | null;
  /** Wirft die übernommenen Positionen weg und rechnet das Layout komplett neu. */
  layoutNeuBerechnen?: boolean;
  /** Verwirft eine gemeldete strukturelle Handänderung und erzeugt trotzdem. */
  driftVerwerfen?: boolean;
  /** Inhalt des Glossars. Fehlt es, merkt sich dieser Lauf keine Namen. */
  glossar?: string | null;
  /** Ziel-Ausführungsplattformversion; ohne Angabe gilt STANDARD_PLATTFORM_VERSION. */
  plattformVersion?: string;
};

export type RenderErgebnis = {
  /** Das erzeugte Diagramm — `null`, sobald es einen Fehler gibt. Ungeprüft wird nie etwas geliefert. */
  diagramm: string | null;
  pruefung: Pruefergebnis;
  /** Begriffe, die dieser Lauf neu ins Glossar bringt, als „Begriff → Name". */
  neueBegriffe: string[];
  /**
   * Das Glossar mit den nachgetragenen Begriffen — `null`, wenn nichts nachzutragen war.
   * Der Seam schreibt nichts; das Zurückschreiben ist Sache der CLI-Hülle.
   */
  glossar: string | null;
  drift: Driftergebnis;
};
