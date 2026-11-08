'use strict';
// No child_process, Firebase SDK/CLI, credentials, network or mutable Cloud state.
const fs = require('node:fs');
const path = require('node:path');
const { validate } = require('./gate.cjs');
const policy = require('../../config/preprod/policy.json');
function main(args)
{
    if (args.length === 1 && args[0] === 'inspect')
        return { mode: policy.mode, approvedTargetCount: policy.approvedTargets.length, cloudExecutionAuthorized: false };
    if (args.length !== 7 || args[0] !== 'check' || args[1] !== '--manifest' || args[3] !== '--project' || args[5] !== '--component')
        throw new Error('offline-review-arguments-only');
    const bundle = JSON.parse(fs.readFileSync(path.resolve(args[2]), 'utf8'));
    return validate(bundle, { projectId: args[4], component: args[6], now: Date.now() }, policy);
}
if (require.main === module)
{
    try { process.stdout.write(JSON.stringify(main(process.argv.slice(2))) + '\n'); }
    catch (error)
    {
        // Never echo manifest content, supplied credentials, file paths or raw parser errors.
        const code = error.code && /^[a-z-]+$/.test(error.code) ? error.code : 'offline-review-rejected';
        process.stderr.write(JSON.stringify({ rejected: true, code, cloudExecutionAuthorized: false }) + '\n');
        process.exitCode = 1;
    }
}
module.exports = { main };
