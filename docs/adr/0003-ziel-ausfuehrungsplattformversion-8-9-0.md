# Erzeugte Diagramme tragen Camunda 8.9.0, einstellbar pro Lauf

Jedes erzeugte Diagramm bekommt `modeler:executionPlatform="Camunda Cloud"` und
`modeler:executionPlatformVersion="8.9.0"`. Der Wert ist über `--plattform-version` oder
`PROZESS_PLATTFORM_VERSION` einstellbar; die Voreinstellung steht als
`STANDARD_PLATTFORM_VERSION` in `src/renderer.ts`.

## Considered Options

Zur Wahl standen **8.9.0** (was die vorhandene `processes/smoke-test.bpmn` aus dem echten
Desktop Modeler trägt) und **8.10.0-alpha3** (die Version des lokalen Clusters). Der Modeler
warnt, wenn die Version im Diagramm von der des verbundenen Clusters abweicht — es gibt also
keine Wahl, die nie warnt, solange der Cluster auf einem Alpha steht.

8.9.0 gewinnt, weil es eine veröffentlichte Version ist, weil der Kompatibilitätslinter dagegen
prüfen kann, und weil ein Cluster ältere Diagramme annimmt — umgekehrt nicht. Ein
Alpha-Bezeichner als dauerhafte Voreinstellung hieße, dass die Voreinstellung mit jedem
Alpha-Wechsel falsch wird.

## Consequences

Solange der lokale Cluster 8.10.0-alpha3 fährt, warnt der Modeler beim Verbinden über die
Abweichung. Das ist eine Warnung, kein Fehler, und mit einem Schalter am Lauf zu erledigen.
Steigt der Cluster auf eine veröffentlichte Version, gehört die Voreinstellung nachgezogen —
sie steht deshalb an genau einer Stelle.
