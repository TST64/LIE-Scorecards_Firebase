'use strict';
// One implementation; generated browser asset is NOT an independent test oracle.
const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
fs.copyFileSync(path.join(root,'functions/hcp-rules.js'),path.join(root,'Hcp_Rules.js'));
