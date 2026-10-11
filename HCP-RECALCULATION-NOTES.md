# HCP history / admin recalculation (5.2.9)

## Implemented
- Correct 9-hole stroke allocation from branch e229587 remains in place.
- New scorecards store `hcpStart` in addition to `strokesGiven`.
- Historical Dashboard/Leaderboard/LiveDashboard prefer the stored historical HCP instead of today's player HCP.
- Admin center has a new historical round correction dialog.
- Admin can change date, course, round type, participant start HCP overrides, hole scores, putts and ladies.
- "Speichern & Saison neu berechnen" recalculates all completed rounds from the configured season start in chronological order.
- The recalculation writes `hcpStart` / `hcpEnd` maps to each round and updates `hcpStart` / `strokesGiven` on scorecards.
- Final calculated HCPs are synchronized to `spieler` and `spieler_public`.
- Firestore rules prevent non-admin users from changing scorecards of completed rounds.

## Legacy season bootstrap
The existing season-start behavior resets all LIE HCPs to 26. Therefore the recalculation seeds every player with HCP 26 at the configured season start. A per-round `hcpStartOverrides` map can intentionally override the chained HCP for a participant.

## Test before deployment
1. Deploy the changed Firestore rules only after local UI testing is complete.
2. In Five Server, log in as Admin and open Admin -> Historische Runde korrigieren.
3. Select 03.10.2026 and verify all three participants show Start-HCP 26.
4. Verify the 9 scores per player against Firestore before saving.
5. Run "Speichern & Saison neu berechnen" and inspect the resulting 03.10 leaderboard and current HCPs.
6. Test later rounds and verify their `hcpStart` equals the previous calculated `hcpEnd` for each participating player.
7. Test a normal new/active score entry as Spieler/Spielleiter.
8. Test that a non-admin cannot modify a scorecard of a completed round after rules deployment.


## Release candidate 5.2.9
- The custom in-app confirmation modal is layered above the historical correction dialog.
- Preview and confirmation are completed before Firestore writes.
- Deleted and non-completed rounds are excluded from the HCP recalculation chain.
- The 03.10.2026 production data was verified after recalculation: HCP start 26/26/26 and HCP end 26/25/26 for players 105/107/112.
- No Firebase Functions changes are part of this release.
- Deploy Firestore rules separately from the GitHub Pages web application.
