# Mission Samstag – S08.2 Zwölf-Profil-Generalprobe

Stand: 10.11.2026, Europe/Berlin. [Issue #26](https://github.com/TST64/LIE-Scorecards_Firebase/issues/26), Basis [Draft-PR #25](https://github.com/TST64/LIE-Scorecards_Firebase/pull/25), exakt `684c470b8c2411da82058b401df0b108fa0d4440`. Neuer Worktree `.codex-s08-2-worktree`, Branch `codex/s08-2-twelve-profile-rehearsal`; PR-Ziel ausschließlich `codex/s08-1-synthetic-cold-restore`.

**Lokale S08.2-Abnahme und Gesamt-Release bleiben NO-GO.** G02/F02 lassen Pending sicher erhalten, bieten aber noch keine vollständige UI-Recovery. Nur lokale synthetische Benutzer und `demo-lie-scorecards-local`; keine PROD-/Cloud-/GAS-Zugriffe, auch nicht lesend, keine echten personenbezogenen Daten, Projektanlage, Deployments, Merges oder Migration. Tatsächlicher Produktionsbestand und Deploy-Stand sind unbekannt. Der [Release-Runbook-Entwurf](MISSION_SAMSTAG_RELEASE_RUNBOOK.md) ist ausschließlich ein schriftlicher späterer Ablauf.

## Bestätigter Anwendungsfehler und enger Fix

Tests-zuerst-Commit `c8a87e8`: zwei reproduzierbar rote Regressionen. `stopScoreAutoSyncV2()` invalidierte den Controller, ließ aber den bestehenden Ansichtsstatus `ready` stehen. Nach Logout und Anmeldung desselben Owners konnte dieselbe Runde deshalb eine scheinbar bereite Ansicht mit ungültigem Controller benutzen. Neue Klicks wurden nicht angenommen.

Der Fix markiert ausschließlich die vorhandene Ansicht als `needsReload`. Das normale erneute Öffnen lädt den autoritativen Controller. Einträge, Pending-Operationen, ursprüngliche IDs und dauerhafter Speicher werden nicht gelöscht, umgebogen oder fremden Konten zugeordnet. Die zwei neuen Regressionen sind danach grün; Fix-Commit `ae3b100`. Keine Änderung an HCP-, CAS-, Generation-, Receipt-, Auth-, History-, Closure- oder Rules-Verträgen; V1-/unversionierte Admin-/History-Schreiber und Masterreset bleiben gesperrt.

## Testaufbau und Beleggrenzen

Zwölf tatsächliche eigene Headless-Chrome-Prozesse mit zwölf verschiedenen `user-data-dir`-Verzeichnissen und unabhängigem Auth-/IndexedDB-Zustand. Die Startprüfung verlangt zwölf verschiedene PIDs und Verzeichnisse. Benutzer MS01–MS12 bilden drei Viererflights. MS01 ist Admin, MS05 Spielleiter, die anderen Spieler. Zusätzliche ausdrücklich benannte Zweitgeräte/Leser aus der erhaltenen S05-/S07-Regression sind davon getrennt.

Der vorhandene S05-Treiber bekommt ausdrücklich optionale Rehearsal-Hooks. Ohne diese Hooks bleiben seine alten fehlende-Karte-, Freeze-, Mehrgeräte-, Parallelabschluss- und verlorenes-ACK-Szenarien aktiv; diese Standardeinstellung wurde in der vollständigen Integration und im frischen S08.1-Quellenaufbau erneut ausgeführt. Im Zwölf-Profil-Modus sind vor diesem Punkt bereits sämtliche Karten eingegeben, deshalb wird dort nicht fälschlich noch eine fehlende letzte Karte erwartet. Der getrennte H01-Fall demonstriert stattdessen ausdrücklich den anderen Fall „Server vollständig, vergessenes Gerät hat lokal Pending“. Keine alte Sicherheitsassertion wurde aus der Standardsuite entfernt.

Initiale mobile Viewports320/390/430px, Touch-Emulation und ein echter CDP-Touch auf dem normalen Schlag-Button jedes Spielers. Hit-Flächen werden gemessen; anschließend laufen die tatsächlichen Score-Controls und der automatische V2-Sender. Für jede eigene Karte prüft der Test separat den Firestore-Serverwert. Es gibt keine Adapter-Direktaufrufe als Ersatz für diese Eingaben. Ein Browser wird mit noch unbestätigter, offline lokal gespeicherter Operation tatsächlich beendet und als neuer Prozess mit demselben eigenen Profil wieder gestartet.

Das sind **keine echten Smartphones**. Tatsächliches Android/iOS, OS-Hintergrund/Sperrbildschirm, Netzwechsel und Hardware-/Speicherdruck sind S08.3. Bei Offline-Reload bleiben die lokalen statischen Testdateien erreichbar; die Emulatorendpunkte werden gesperrt und `navigator.onLine=false` gesetzt. Damit wird der echte Offline-Datenpfad mit dauerhaftem IndexedDB-Kontext geprüft, kein produktives Service-Worker-/Installationsversprechen. Die bestehenden CSP-/Netzwerk-/Credential-/Cloud-Gates bleiben aktiv.

Die tatsächlich erzeugten Screenshots MS01/MS02/MS03 bei320/390/430px wurden zusätzlich betrachtet: Karten unterscheiden grünes „Serverbestätigt“ und oranges „Noch offen“, die normalen Plus-/Minus-Controls und die feste Lochnavigation sind erkennbar. Vier Karten brauchen abhängig von Scrollposition und Breite vertikales Scrollen. Die ersten Schlag-Touchflächen waren mindestens40×40 CSS-Pixel. Das ist eine begrenzte Layout-/Interaktionsprüfung; Verständlichkeit des globalen gegenüber dem kartenspezifischen Status und die zumutbare Flightkoordination sind mit den echten Teilnehmern noch abzunehmen.

Ein QuotaExceededError wird an der tatsächlichen IndexedDB-Transaktionsgrenze injiziert; es wird kein physisch voller Datenträger behauptet. Die Functions-Störung blockiert ausschließlich den Functions-Port aus Sicht des Browsers; das tatsächliche Anhalten/Fortsetzen eines laufenden lokalen Functions-Prozesses und ein Cloud-Worker-Neustart sind daraus nicht belegt. Diese zusätzliche Prozessstörung bleibt OFFEN. Der S07-Test beendet dagegen seinen eigenen Historienworker tatsächlich mit Exit73; das ist ein anderer Nachweis als ein suspendierter Callable-Prozess. Der Browserprozessabbruch wird ebenfalls davon unterschieden.

## Ausgeführte Regressionen

Der nachgelagerte Guard-Befund ist ein zusätzlicher **Testtreiberfehler**, kein freigegebener Cloudaufruf: `Network.requestWillBeSent` kann auch für ein anschließend durch CSP abgewiesenes Bild erscheinen. Nach Offline-Reload beobachtete der Diagnoselauf MS03/`https://www.google.com`; der installierte Firebase-WebChannel-Code enthält den Konnektivitätstest `/images/cleardot.gif`. Die gezielte echte Chrome-Reproduktion dieses Bildpfads war zunächst rot und belegte zugleich erzwungene `img-src`-CSP, `Network.loadingFailed.blockedReason=csp` und Bildfehler. Tests-zuerst-Commit `c81f16d` hält die Reproduktion und ersten acht roten Guard-Fälle fest; ein neunter Redirect-Fall wurde anschließend ebenfalls zuerst rot gezeigt.

Die Korrektur betrifft ausschließlich den Testtreiber: Nur genau dieses GET-Bild zählt bei **beiden unabhängigen Chrome-CSP-Belegen und ohne Response/Redirect** als nachweislich blockierter SDK-Versuch. Andere Pfade, Requesttypen, Methoden oder unbekannte Ausgänge bleiben Fehler. DNS-Fehler und Report-only-CSP genügen ausdrücklich nicht. Eine Remote-Antwort macht auch einen sonst passenden Fall rot. Die Anwendung, ihr CSP-Header, DNS-Sperre, Credential-/Cloud-Gates und die Liste erlaubter Loopback-Ziele bleiben unverändert; es wurde kein Google-Origin freigegeben. `forbiddenOrigins=0` bedeutet damit keine ungeklärten/unblockierten Remote-Versuche, nicht die falsche Behauptung, der SDK habe nie ein solches Bild angefordert. Diese blockierten Versuche werden separat gezählt und belegt. Die Netzwerkbelege betreffen die über CDP erfassten App-/Zusatzkontexte und die lokalen Node-Gates; es wird kein vollständiger OS-Paketmitschnitt oder Netzwerknachweis für beliebige andere Prozesse behauptet.

| Befehl / Beleg | Bestätigtes Ergebnis |
| --- | --- |
| `node --test tests/*.test.cjs functions/test/*.test.js` | 381/381, alle370 bisherigen Fälle plus zwei Anwendungs- und neun Guard-Regressionen, keine Skips |
| `node --test tests/rehearsal-s08-2.test.cjs` vor Fix | 0/2, beide erwarteten Fehler reproduziert; `.local-runtime/s08-2-red.txt` |
| Unveränderte Hotfix-Suite `node --test tests/*.test.cjs` im separaten Hotfix-Worktree | 30/30; Ausgabe ausschließlich im neuen Worktree |
| `node tests/run-score-sync-browser.cjs` | Bestehende Sync-/IndexedDB-Browserprüfung, 27 PASS |
| `node tests/run-score-screen-browser.cjs` | Je75 Checks bei320/390/1024px, keine V1-/V2-Schreibzugriffe der Layoutsuite |
| `node tests/run-browser-network-s08-2.cjs` | Echte Chrome-CSP-Reproduktion zuerst rot, nach streng eingegrenzter Auswertung grün; reine Testtreiberprüfung, keine Anwendungsabnahme |
| `npm run test:integration` | Vollständige echte S01–S07-Demo-Regression Exit0, einschließlich432-Karten-Saison, PIN/Auth, Mehrgeräte-/Admin-Rennen, HCP0/Snapshots, atomaren Abschlüssen, S07-400+59/Worker-Recovery und alter Writer-Sperren |
| `npm run test:rehearsal` | Lauf `rb46bda1c` vollständig einschließlich Browser-/CSP-Gates und Teardown, Exit0: 24 PASS, G02/F02 OFFEN; ausdrücklich kein lokales GO |
| `npm run test:restore` | Vollständiger frischer Quellenaufbau und alle drei frischen Demo-Restores Exit0; neuer Lauf `run-1794343789120-e91fe345`, siehe unten |

Gemessene Laufzeit: Node22.21.0, Chrome156.0.8078.80, Firebase CLI15.33.0, Web-SDK10.8.0, Admin-SDK13.10.0, Functions-SDK7.4.0, Firestore-Emulator1.22.0 und lokales Java21. CLI-HOME/ADC/Tokens/Proxyvariablen sind getrennt; alle Profile liegen unter ignorierten neuen Laufverzeichnissen. Integration, Generalprobe und Restore nacheinander ausführen, da Hub-/Logging-Ports gemeinsam benutzt werden. PINs, Hashes und Tokens gehören nicht in Beleg-JSONs, Screenshots, Bericht oder PR.

## Erneute S08.1-Kaltstart-Abnahme

Der vollständige Befehl `npm run test:restore` lief im neuen Worktree ohne Wiederverwendung alter Backups: `run-1794343789120-e91fe345`. Erster Gesamtbeleg `.local-runtime/s08-2-restore-initial-proof.json`, Konsolenergebnis `.local-runtime/s08-2-restore.txt`, getrennte Ziel-Logs unter `.local-runtime/s08/catalogs/<Lauf>/`. Alle vier Sessions (Quelle sowie drei Ziele) endeten erfolgreich.

| Frisches Ziel | Neue gültige Birth-Paare / veränderte Creation-Times | Bestätigter Folgeschritt |
| --- | --- | --- |
| Closed/Corrected | 433/433 | Receipt-/Closure-/S07-Replay, danach108 normale UI-Karten, vierter Abschluss und fünfter Start mit MS02 HCP23.1 |
| Interrupted history | 432/432 | Sichere S07-Wiederaufnahme/Veröffentlichung, Replay, danach108 UI-Karten, Abschluss und nächster Start23.1 |
| Auth state | 433/433 | Pending-PIN verweigert Reads, sichere Fertigstellung konsistent, Login-Sperre und deaktiviertes Konto erhalten |

Jedes Ziel: neue Emulatorinstanz und Browserprofile, ursprüngliche Quellenports nicht erreichbar, `sourceFallbackUnavailable=true`, `forbiddenOrigins=0`. Karte und Generation-Binding erhalten gemeinsam eine neue echte Firestore-Birth-Zeit; konservierte Original-`createTime` wird ausdrücklich nicht behauptet. Neun beschädigte/unvollständige Artefaktvarianten werden vor Zielwrites verweigert. Der echte Importworker-Abbruch nach dem ersten100er-Batch lässt den Closed-Import gesperrt und wird sicher fortgesetzt. Alte Owner-/Legacy-Puffer werden nicht automatisch übernommen. Backups, synthetische Auth-Secrets und private Laufdaten bleiben lokal ignoriert; der Bericht enthält keine PINs, PIN-Hashes oder Tokens.

Nach der endgültigen CSP-Metadatenkorrektur wurden **alle drei Ziele erneut frisch** ausgeführt, Exit0. Befehl in PowerShell: `$env:S08_REUSE_BACKUP_RUN='run-1794343789120-e91fe345'; npm run test:restore`. Dies verwendet ausschließlich die zuvor in diesem Auftrag erzeugten versiegelten synthetischen Sicherungen; keine alten Review-Worktrees oder externen Backups. Frischer Zielkatalog-Lauf `run-1794348170008-940952ee`; endgültiger Gesamtbeleg `.local-runtime/s08-proof.json`, Konsole `.local-runtime/s08-2-restore-recheck.txt`. Erneut433/432/433 gültige neue Birth-Paare und entsprechend veränderte Creation-Times, beide spielbaren Ziele mit108 UI-Karten und Folgestart23.1, alle Auth-Sonderzustände erhalten. Der erste vollständige Quellen-/Ziellauf bleibt separat gesichert; keine Quellen-Neuerstellung oder konservierte Creation-Time wird für diese Zielwiederholung behauptet.

## Endgültiger Zwölf-Profil-Lauf

`rb46bda1c`, vollständig mit Exit0 beendet. Gesamtbeleg `.local-runtime/s08-2-proof.json`, Konsole `.local-runtime/s08-2-rehearsal.txt` sowie deren Kopie im Laufverzeichnis. **26 Matrixeinträge: 24 PASS, 2 OFFEN.** Zwölf eigene Browserprofile, 432 eigene normale UI-Karten, neun synthetische Flightfreigaben über drei Runden, drei atomare Abschlüsse, vollständige MS02-Korrektur über drei Runden und normaler Start der vierten Runde sind bestätigt. Die alten Standard-S05-/S07-Fehler-, Parallelitäts- und Wiederholungsprüfungen sind im Lauf erhalten.

Alle abschließenden Profil-Gates bestanden. Genau ein SDK-Konnektivitätsbild wurde im Endprofil MS03 nachweislich durch CSP blockiert: exakter Bildpfad, GET/Image, erzwungene `img-src`-Audits, passendes Request-/Session-ID-Paar mit `blockedReason=csp`, keine Response und kein Redirect. Rohbeleg im eigenen Profil: `p03/<Profil>/loopback-boundary.json`. `forbiddenOrigins=0`, `finalProfileBlockedConnectivityImages=1`. Dieser Wert ist kein „nie versucht“-Versprechen, sondern die belegte Trennung von blockiertem SDK-Versuch und tatsächlich erlaubtem Loopback-Datenverkehr.

G02 ließ eine Pending-Operation bei unverändertem neuen Serverwert stehen; F02 ließ zwei Pending-Operationen stehen und erzeugte keine Serverkarte. Entsprechend lauten beide Gesamtflags **`localGo=false` und `releaseGo=false`**. Exit0 bestätigt die vollständig ausgeführte, korrekt negativ entscheidende Prüfung, keine Abnahme. Es wurde in den ausgeführten Fällen kein stilles Überschreiben bestätigter Werte, kein verlorener Receipt-Replay und kein doppelter HCP-Abschluss festgestellt; daraus folgt keine Garantie für die unten ungeprüften Situationen.

## Zwölf-Profil-Matrix

Die maschinenlesbare Matrix liegt pro Lauf unter `.local-runtime/82/<Lauf>/matrix.json`. Jeder Eintrag enthält Test-ID, Profil, Vorbedingung, UI-Aktion, unabhängig geprüften Serverzustand und PASS/OFFEN. Screenshots der ersten Front-Karte werden je MS-Profil ausschließlich lokal abgelegt. Ein vollständiger Gesamtbeleg entsteht erst nach Abschluss und Beendigung der Profile; Zwischenmatrizen sind keine Abnahme.

Die mit dem PR prüfbare bereinigte Belegkopie [S08_2_SYNTHETIC_ACCEPTANCE.json](evidence/S08_2_SYNTHETIC_ACCEPTANCE.json) enthält die26 endgültigen Matrixeinträge, Versionsstände, Regressionsergebnisse, Restore-Zähler und SHA-256-Prüfsummen der lokalen Logs/Gesamtbelege. Keine PINs, PIN-Hashes, Auth-Tokens, privaten Backupdaten oder Browserprofile werden übernommen. Private Rohbelege bleiben ignoriert und lokal.

| ID | Profile / Vorbedingung | UI-Aktion und unabhängiges Soll | Ergebnisstand |
| --- | --- | --- | --- |
| A01 | MS01–MS12, frischer Seed | Normale PIN-Oberfläche, zwölf getrennte UID-/Speicherzustände und drei Rollentypen | PASS |
| A02 | MS06, DB verlangt Wechsel trotz altem False-Claim | Reload muss Pflichtwechsel zeigen; normaler PIN-Wechsel, DB/Claims anschließend konsistent | PASS |
| A03 | MS10, absichtlich überhöhter Claim / ungültige DB-Rolle | DB-Rolle bleibt autoritativ, keine Adminrechte; ungültige autoritative Rolle verweigert Read | PASS |
| R0/R1/R2 | Alle zwölf, normale9F/9B/18-Anlage | Jeder gibt jede eigene Karte über UI ein;108/108/216 separat serverseitig prüfen | PASS, 108/108/216 |
| N01 | MS02, bestehende Karten | Offline mehrere Löcher, Putts, Lady True/False, Strich/Clear; nicht grün bestätigen; Reconnect persistiert Clear/False | PASS |
| N02 | MS03, echter Commit / verlorene Antwort | Offline-Reload, weitere Eingabe hinter unbekanntem Request, identischer Receipt-Replay ohne doppelte Revision | PASS |
| C01 | MS01 und MS02, gleiche Generation / bekannte Feldrevision | Versionierter Admin-UI-Schreiber und veralteter eigener Schreiber; Konflikt, unabhängiges Feld und ausdrücklicher Discard | PASS |
| A04 | MS04 mit Pending, danach anderes Konto MS05 | Fremde Queue bleibt lokal; Rückkehr MS04 setzt ursprüngliche Queue fort; gleicher Owner kann neue UI-Eingabe annehmen | PASS |
| N03 | MS08, echte Antwort wird zurückgehalten | Weitere Eingabe während Request; beide Änderungen und genau zwei Revisionen erhalten | PASS |
| D01 | MS09, injizierter IDB-Fehler / CPU-Throttle4 | Abgewiesene Eingabe wird gemeldet, weder neuer lokaler Wert noch Serverwrite; danach langsamer Browser normal nutzbar | PASS |
| N04 | MS10, online bei getrenntem Functions-Port | Unbekannter Ausgang bleibt pending/Fehler; nach Freigabe derselbe Request sicher verarbeitet | PASS |
| N05 (Zusatzgrenze) | Tatsächlich laufender lokaler Functions-Prozess | OS-seitiges Suspend/Resume statt Portunterbrechung | OFFEN, nicht ausgeführt; N04 und S07-Workerabbruch ersetzen diesen Nachweis nicht |
| D02 | MS07, offline dauerhaft angenommene Eingabe | Echter Browserprozessabbruch und Neustart desselben Profils, dieselbe Mutation genau einmal | PASS |
| H01 | MS12 absichtlich vergessen, Serverkarten vollständig | Server kann Offline-Queue nicht kennen; Fenster wird ohne Commit abgebrochen, Gerät abgeglichen | PASS |
| H02/H03/H04 | Alle zwölf plus zusätzlich benutzte Schreiber | Online, Pending0, keine Konflikte/unbekannten Requests; danach drei normale Flight-Checkboxfreigaben | PASS, alle drei Runden |
| S07 | Drei veröffentlichte Runden, 432 Karten | Normale Admin-Korrektur MS02 Front6 7→3, vollständige Folgekette, neue Runde | PASS |
| G01/G02 | Separater lokaler Rebirth-Fault in aktiver Folgerunde | Alte Generation darf nicht schreiben; explizite Recovery versuchen, verbleibendes Pending als Blocker ausweisen | G01 PASS; G02 OFFEN, Pending1 |
| F01/F02 | Lokale Flight-Fault-Fixture, altes Gerät offline | Alter Flight darf nicht schreiben; keine automatische Queue-Adoption, Recovery prüfen | F01 PASS; F02 OFFEN, Pending2 |
| D03/D04 | Profilverlust mit unbekannter lokaler Eingabe | Neues leeres Profil darf nichts als gesendet ausgeben; erst bewusste manuelle Neueingabe nach Serverabgleich | PASS; ursprüngliches Offline-Profil nur stillgelegt, nicht gelöscht |
| P01 | Nach den Störungsfixtures | Die drei geschlossenen, historisch korrigierten Runden/HCPs bleiben konsistent | PASS, Closure-Revisionen2/2/2, Published1, MS02 HCP23.1 |

Die persönlichen Flightbestätigungen werden durch den Testakteur nach tatsächlichen lokalen Prüfungen **synthetisch simuliert**. Das ist keine reale persönliche Erklärung der zwölf Golfer. Jede tatsächlich noch ausstehende Owner-/Flight-/Generations-Recovery wird gesondert als Blocker dokumentiert, nicht durch Löschen der Queue oder Ausblenden von Tests beseitigt.

## Tatsächliche Zwischenfehler und Annahmen

- Vor dem Seed geladene Profile kannten die neue Spielerliste noch nicht. Der Treiber lädt die normale Oberfläche nach dem synthetischen Seed neu. Ebenso wird eine von einem anderen Gerät neu angelegte Runde über den normalen Datenrefresh bekannt gemacht; Score-Adapter ersetzen diesen Ablauf nicht.
- Beim parallelen Kaltstart traten CDP-/Functions-Startfehler auf. Vor zwölf Profilen wird die eigene lokale Functions-Bereitschaft geprüft; Browserstart ist begrenzt, zusätzliche leere Starttabs werden vermieden. Das ist Testinfrastruktur, keine bewiesene Aussage zur Cloud- oder Mobilgeräteperformance. Ein fehlgeschlagener Vorlauf bleibt Exit1.
- Kalte normale Login-/Firestore-Läufe überschritten die ursprüngliche30s-Testbeobachtung. Der Treiber beobachtet den unveränderten Erfolgszustand begrenzt länger und protokolliert ausschließlich Aktionsphasen, keine Argumente. Keine Erfolgserwartung wurde auf bloße Auth-Anmeldung oder einen lokalen Status verkürzt.
- Ein Vorlauf endete bei MS04/18/Loch11 nach30s noch mit `sending` und zwei Pending-Operationen. Es wurde kein Servererfolg behauptet. Der erneute Lauf verlangt weiterhin `confirmed` und vollständig Pending0, beobachtet dies begrenzt90s und liest bei einem Fehler den Server unabhängig. Der darauffolgende vollständige18-Loch-Durchlauf bestand. Daraus folgt weder ein Performanceversprechen noch ein Nachweis der ursprünglichen Timeout-Ursache.
- Im Lauf `r3baf73da` bestanden alle fachlichen Matrixprüfungen bis P01, G02/F02 blieben OFFEN. Danach schloss Chrome die CDP-Verbindung vor der Antwort auf `Browser.close`: Suite Exit1, kein Gesamt-Proof. Der Testtreiber akzeptiert eine geschlossene Verbindung jetzt ausschließlich beim ausdrücklich angeforderten `Browser.close`; sein `finally` verlangt weiterhin das tatsächliche Ende des eigenen Prozesses. Andere Verbindungsabbrüche bleiben Fehler. Dieser Vorlauf bleibt als fehlgeschlagen dokumentiert; die nachfolgende Wiederholung ersetzt seinen fehlenden Gesamtbeleg.
- `r1baacdb1` erreichte erneut alle26 Matrixeinträge, scheiterte danach aber am Ursprungsguard: Exit1, kein Gesamt-Proof. Die frühere Stack-only-Ausgabe nannte den Ursprung noch nicht. Der gezielte Diagnoselauf `r53446f01` brach deshalb bereits nach N02 mit `https://www.google.com` ab. Die anschließend zuerst rote Browser-Reproduktion und die neun strengen Guard-Fälle grenzen den nachweislich CSP-blockierten SDK-Bildtest ein; der vollständige Endlauf `rb46bda1c` prüfte zusätzlich nach jedem Matrixeintrag. Diese roten Läufe werden nicht nachträglich als bestanden umetikettiert.
- Die erste Rollen-Testannahme „abweichender Tokenrollenwert muss den Statusaufruf verweigern“ war falsch: Der vorhandene Vertrag benutzt die autoritative DB-Rolle. Nach Codeprüfung testet der Fall konkret fehlende Rechteeskalation und die Verweigerung einer ungültigen DB-Rolle; dafür wurde keine Anwendungslogik verändert.
- Ein zusätzlicher Node-Lauf innerhalb der Sandbox endete371/372: Die Loopback-HTTP-Prüfung meldete `fetch failed`. Derselbe unveränderte Gesamtbefehl mit freigegebenem lokalem Netzwerkzugriff bestand anschließend372/372. Der fehlgeschlagene Lauf liegt separat unter `.local-runtime/s08-2-node-sandbox-failed.txt`; kein Test wurde entfernt oder abgeschwächt.

## Getrennte Entscheidung

**Lokale S08.2-Abnahme: NO-GO.** Der vollständige fachliche Durchlauf ersetzt die beiden noch nicht gelösten Recovery-Pfade nicht:

| Blocker | Reproduziertes Verhalten | Erforderlicher Folgeauftrag |
| --- | --- | --- |
| G02 – Generation ersetzt | Alter Request wird verweigert, neuer Serverwert bleibt erhalten; nach normalem Refresh/Discard bleibt eine Pending-Operation | Expliziten, getesteten Recovery-Vertrag für nicht mehr passende Generationen entwerfen. Unbekannte Request-Ausgänge zuerst klären; ursprüngliche Mutation niemals auf eine neue Generation umschreiben. Bewusstes Verwerfen und gesonderte manuelle Neueingabe müssen unterscheidbar sein. |
| F02 – Flight gewechselt | Alter Flight darf nicht schreiben; es entsteht keine Serverkarte, zwei Pending-Operationen bleiben nach dem normalen Recovery-Versuch erhalten | Autoritativen neuen Flightkontext und ausdrücklichen Umgang mit der alten Queue abnehmen. Keine fremde Queue übernehmen, Berechtigungen erweitern oder alte Mutationen automatisch neu adressieren. |

Diese Fälle sind absichtliche lokale Fehlerfixtures außerhalb der normalen Rundenfolge. Die Abwehr ist bestätigt, eine zumutbare vollständige Bediener-Recovery ist es nicht. Kein verdecktes Löschen der Queue, keine Aufweichung der Writer-Sperren und kein Abschließen einer betroffenen Runde, um ein grünes Ergebnis zu erzeugen. Die folgenden Reparaturen brauchen eigene rote Regressionen für ursprüngliche IDs, verlorene Antworten, Neustart und explizite Benutzerentscheidung. Der vorliegende Anwendungsfix beschränkt sich auf den reproduzierten Login-/Controllerfehler.

Wirkliche Mobilgeräte und die Verständlichkeit/Zumutbarkeit für zwölf echte Teilnehmer sind S08.3-Blocker. Produktive Daten-/Auth-/Cloud-/PreProd-/Backup-/Cutover-/Rollback-Abnahme und die offenen Brutto-/Putts-/DNF-/Nichtantrittsregeln bleiben getrennt **ungeprüft**. Das Gesamt-Release bleibt **NO-GO**.

## Ungeprüfte Annahmen und offene Entscheidungen

- N05 ist nicht ausgeführt: Ein tatsächlich suspendierter lokaler Functions-Prozess wird weder durch N04-Portunterbrechung noch den anderen S07-Historienworker-Abbruch vollständig abgedeckt.
- Echte Mobilgeräte, Betriebssystemhintergrund/Sperre, kompletter Offline-Neustart ohne erreichbaren statischen Server, Installation/Service Worker, Funkwechsel und physischer Speicherdruck sind nicht abgenommen. Touchsimulation, CPU-Throttle und injizierter IDB-Fehler sind begrenzte Ersatzszenarien.
- Die persönlichen Erklärungen der zwölf tatsächlichen Teilnehmer und die praktische Zumutbarkeit der Flightkoordination sind nicht durch automatisierte Checkboxen bestätigt.
- Produktionsschema/-bestand, ausgelieferte Version, Cloud-Backup/PITR, Auth-Restore, PreProd-Projekt und Migration/Rollback sind unbekannt. Sie brauchen eigene später ausdrücklich genehmigte Prüfungen; keine realen personenbezogenen Daten in diese Testumgebung übernehmen.
- Brutto-/Putts-Wertung, DNF, Nichtantritt und unvollständige Runden sind fachlich offen. Die bestätigte Gruppen-HCP-Regel und die getestete technische Strich-/Clear-Behandlung beantworten diese Fragen nicht zusätzlich.

## Worktree-Integrität

Abschlussvergleich am10.11.2026 um23:08 Europe/Berlin: PASS. Alle neuen Änderungen liegen ausschließlich im neuen Worktree. Die sechs SHA-256-Dateihashes des ursprünglichen Dirty-Stands, vollständiger Git-Diff und unversioniertes Inventar sind unverändert. Original-HEAD bleibt `cb4661f5194147fa0ef0f40fe44838ce3d0aa19e`. Sämtliche bisherigen Review-/Hotfix-HEADs und Git-Status stimmen mit der Ausgangsaufnahme überein; das bestehende unversionierte Hotfix-`fiveserver.config.js` bleibt erhalten. Lokaler Ergebnisbeleg `.local-runtime/s08-2-integrity-final.txt`. Ein Git-/Dirty-Dateivergleich ist kein vollständiger Hashnachweis sämtlicher ignorierter Laufdateien.
