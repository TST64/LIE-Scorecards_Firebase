# Separater V1-Hotfix – ausschließlich historische Referenz

Quelle: lokaler Branch `hotfix/v1-score-safety`, Commit `55c0db4344c1da9501609d7525722a7c82e2aeb5`. Dieser Commit ist **kein** Vorfahr von `d50c3d9` und wurde nicht gemergt/cherrygepickt. Sein vorhandener Worktree bleibt unverändert.

`V1_HOTFIX_55c0db4.patch` bewahrt den unveränderten Diff der vier betroffenen Dateien einschließlich damaliger Regressionen. Der Patch wird weder beim Start noch in einer Testsuite oder Paketierung ausgeführt. Er ist kein aktueller Anwendungscode und keine Empfehlung, ihn blind auf main anzuwenden.

Die aktuelle V2-Linie enthält die späteren S01-Snapshot-/ABA-/Persistenzprüfungen und S02/S03-Sperren gegen unversionierte Schreiber. Ein Import alter V1-Dateiversionen würde diese Verträge umgehen/zurücksetzen. Aktuelle Regressionen: `tests/v1-s01-snapshot.test.cjs` und `tests/v1-s01-bridge.test.cjs`.

Für die ausdrücklich von main ausgehende iterative Weiterentwicklung kann eine neue KI diesen kleineren historischen V1-Diff als Vergleich verwenden. Jede konkret ausgewählte Korrektur muss gegen den tatsächlichen main-Stand reproduziert und mit den aktuellen Schutzverträgen bewertet werden. Dieser Branch erteilt keinerlei Merge-, Betriebs-, Firebase- oder Deployment-Freigabe.
