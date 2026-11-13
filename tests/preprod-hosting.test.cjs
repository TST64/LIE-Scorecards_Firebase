'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../tools/preprod/hosting-contract.cjs');
const gate = require('../tools/preprod/gate.cjs');
const policy = require('../config/preprod/policy.json');
const proposal = require('../config/preprod/proposal.json');
const example = require('../config/preprod/hosting/firebase.proposal.json');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture()
{
    const id = proposal.proposedProjectId;
    const frontend = { projectId: id, origin: proposal.proposedOrigin, banner: proposal.banner,
        storageNamespace: 'preprod:' + id, serviceWorker: 'disabled', legacyBuffers: 'quarantined', mailMode: 'disabled', gasUrl: null };
    const files = Object.fromEntries(contract.PUBLIC_FILES.map(name => [name, { kind: 'regular-file', content: 'SYNTHETIC PUBLIC REVIEW FILE' }]));
    files['assets/environment.json'].content = JSON.stringify({ ...frontend, authDomain: id + '.firebaseapp.com', region: 'europe-west1' });
    return { mode: 'hosting-review-only', cloudExecutionEnabled: false, projectId: id, siteId: id, origin: proposal.proposedOrigin,
        customDomainAllowed: false, dnsChangesAllowed: false, hostingActivated: false, originVerified: false,
        auth: { projectId: id, authDomain: id + '.firebaseapp.com', authorizedDomains: [id + '.web.app', id + '.firebaseapp.com'] },
        frontend, functions: { projectId: id, region: 'europe-west1' }, config: clone(example), artifact: { files, digest: gate.digest(files) } };
}
test('binding decision is standard Firebase Hosting, explicitly unprovisioned', () =>
{
    assert.equal(proposal.hostingDecision, 'firebase-hosting-in-separate-preprod-project');
    assert.equal(proposal.domainStrategy, 'firebase-standard-subdomains-only');
    assert.equal(proposal.proposedOrigin, 'https://' + proposal.proposedProjectId + '.web.app');
    for (const key of ['projectAvailabilityChecked', 'domainAvailabilityChecked', 'hostingActivated', 'originVerified', 'customDomainAllowed', 'dnsChangesAllowed', 'approved']) assert.equal(proposal[key], false);
});
test('inactive example matches the review contract but never authorizes Cloud', () =>
{
    const r = contract.validate(fixture());
    assert.equal(r.structurallyConsistent, true);
    assert.equal(r.cloudExecutionAuthorized, false);
    assert.equal(r.hostingActivated, false);
});
test('Phase 2B policy and unconditional execution lock remain unchanged', () =>
{
    assert.equal(policy.cloudExecutionEnabled, false);
    assert.deepEqual(policy.approvedTargets, []);
    for (const args of [[], [fixture()], [{ cloudExecutionEnabled: true, approved: true }]])
        assert.throws(() => gate.execute(...args), /phase2b-cloud-execution-disabled/);
    assert.deepEqual(require('../firebase.json'), { functions: { source: 'functions', runtime: 'nodejs22' }, firestore: { rules: 'firestore.rules' } });
    assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../.firebaserc'), 'utf8')).projects.default, 'demo-lie-scorecards-local');
});
const cases = [
    ['production project', r => { r.projectId = 'liescorecard-70c5e'; }],
    ['production CNAME in public output', r => { r.artifact.files.CNAME = { kind: 'regular-file', content: 'app.lochihnein.de' }; }],
    ['foreign web.app host', r => { r.origin = 'https://other-preprod.web.app'; }],
    ['custom domain', r => { r.origin = 'https://preprod.example.invalid'; r.customDomainAllowed = true; }],
    ['GitHub Pages host', r => { r.origin = 'https://tst64.github.io'; }],
    ['HTTP', r => { r.origin = 'http://' + r.projectId + '.web.app'; }],
    ['wrong hosting site', r => { r.siteId = 'another-site'; }],
    ['DNS enabled', r => { r.dnsChangesAllowed = true; }],
    ['claimed activation', r => { r.hostingActivated = true; }],
    ['claimed URL verification', r => { r.originVerified = true; }],
    ['Cloud enabled', r => { r.cloudExecutionEnabled = true; }],
    ['missing explicit review mode', r => { delete r.mode; }],
    ['wrong auth domain', r => { r.auth.authDomain = 'other-project.firebaseapp.com'; }],
    ['foreign authorized domain', r => { r.auth.authorizedDomains.push('example.invalid'); }],
    ['wrong auth project', r => { r.auth.projectId = 'other-preprod'; }],
    ['wrong Functions project', r => { r.functions.projectId = 'other-preprod'; }],
    ['wrong Functions region', r => { r.functions.region = 'us-central1'; }],
    ['old buffer migration', r => { r.frontend.legacyBuffers = 'migrate'; }],
    ['enabled worker', r => { r.frontend.serviceWorker = 'enabled'; }],
    ['GAS', r => { r.frontend.gasUrl = 'https://script.google.com/macros/s/SYNTHETIC/exec'; }],
    ['live mail', r => { r.frontend.mailMode = 'live'; }],
    ['repository root public', r => { r.config.hosting.public = '.'; }],
    ['parent path public', r => { r.config.hosting.public = '../../'; }],
    ['missing ignore exclusions', r => { r.config.hosting.ignore = []; }],
    ['Functions config smuggled in', r => { r.config.functions = { source: 'functions' }; }],
    ['catch-all rewrite', r => { r.config.hosting.rewrites = [{ source: '**', destination: '/index.html' }]; }],
    ['Functions rewrite', r => { r.config.hosting.rewrites[0] = { source: '/app', function: 'proxy' }; }],
    ['Cloud Run rewrite', r => { r.config.hosting.rewrites[0] = { source: '/app', run: { serviceId: 'proxy' } }; }],
    ['external redirect', r => { r.config.hosting.redirects = [{ source: '**', destination: 'https://example.invalid', type: 302 }]; }],
    ['secret destination rewrite', r => { r.config.hosting.rewrites[0].destination = '/functions/index.js'; }],
    ['worker CSP allowed', r => { r.config.hosting.headers[0].headers[3].value = "default-src *; worker-src *"; }],
    ['stale cache enabled', r => { r.config.hosting.headers[0].headers[0].value = 'public,max-age=86400'; }],
    ['symlink descriptor', r => { r.artifact.files['index.html'].kind = 'symlink'; }],
    ['tampered content', r => { r.artifact.files['index.html'].content = 'CHANGED'; }],
    ['secret material', r => { r.artifact.files['index.html'].content = '-----BEGIN PRIVATE KEY----- SYNTHETIC-DENIED'; }],
    ['inline source map', r => { r.artifact.files['assets/app.bundle.js'].content = '//# sourceMappingURL=data:SYNTHETIC'; }],
    ['environment content drift', r => { r.artifact.files['assets/environment.json'].content = '{}'; r.artifact.digest = gate.digest(r.artifact.files); }]
];
for (const [name, mutate] of cases)
    test('hosting rejects ' + name, () => { const r = fixture(); mutate(r); assert.throws(() => contract.validate(r)); });
for (const file of ['functions/index.js', 'tests/fixture.json', '.env', '.env.local', 'credentials.json', 'private-key.pem',
    '.codex-worktree/config.js', '.local-runtime/cache.json', 'assets/app.js.map', 'config.js', 'sw.js', '../index.html', '__/firebase/init.js'])
    test('public artifact rejects non-allowlisted path ' + file, () =>
    {
        const r = fixture(); r.artifact.files[file] = { kind: 'regular-file', content: 'SYNTHETIC-NOT-PUBLIC' };
        r.artifact.digest = gate.digest(r.artifact.files);
        assert.throws(() => contract.validate(r), /public-file-allowlist/);
    });
test('hosting contract uses only Phase 2B pure digest and read-only policy modules', () =>
{
    const vm = require('node:vm');
    const context = { module: { exports: {} }, require(name) {
        assert.ok(['../../config/preprod/policy.json', './gate.cjs'].includes(name));
        return name.endsWith('policy.json') ? policy : gate;
    } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../tools/preprod/hosting-contract.cjs'), 'utf8'), context);
    assert.equal(context.module.exports.validate(fixture()).cloudExecutionAuthorized, false);
});
