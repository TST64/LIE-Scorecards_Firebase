'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const gate = require('../tools/preprod/gate.cjs');
const { main } = require('../tools/preprod/review.cjs');
const checkedPolicy = require('../config/preprod/policy.json');
const root = path.resolve(__dirname, '..');
function fixture(component = 'functions')
{
    const projectId = 'synthetic-preprod-review';
    const origin = 'https://preprod.example.invalid';
    const principals = Object.fromEntries(['rules', 'functions', 'frontend', 'rollback'].map(c =>
        [c, c + '-review@' + projectId + '.iam.gserviceaccount.com']));
    const policy = { schemaVersion: 1, mode: 'preprod-review-only', cloudExecutionEnabled: false,
        approvedTargets: [{ projectId, origin, region: 'europe-west1', principals }] };
    const config = { mode: 'preprod', projectId, region: 'europe-west1' };
    const bundle = { schemaVersion: 1, mode: 'preprod', projectId, artifact: { files: {
        'frontend/environment.json': JSON.stringify({ ...config, origin, authDomain: projectId + '.firebaseapp.com',
            banner: 'PREPROD — SYNTHETIC TEST DATA', storageNamespace: 'preprod:' + projectId,
            serviceWorker: 'disabled', legacyBuffers: 'quarantined' }),
        'functions/environment.json': JSON.stringify({ ...config, mailMode: 'disabled', gasUrl: null, dataPolicy: 'synthetic-only' }),
        'deployment/target.json': JSON.stringify({ ...config, origin, hostingProjectId: projectId,
            credentialProjectId: projectId, defaultProjectAllowed: false }) } },
        identity: { projectId, principal: principals[component], type: 'workload-identity', defaultCredentials: false,
            productionAccess: 'absent', inheritedPermissionsReviewed: true, evidenceReference: 'SYNTHETIC-NOT-VERIFIED' },
        approval: { explicit: true, component, projectId, reference: 'SYNTHETIC-NOT-AN-AUTHORIZATION', reviewer: 'synthetic-reviewer',
            expiresAt: '2030-01-02T00:00:00Z' },
        rollback: { targetProjectId: projectId, previousArtifactDigest: 'a'.repeat(64), compatibilityReviewed: true } };
    bundle.artifact.digest = gate.digest(bundle.artifact.files);
    bundle.approval.artifactDigest = bundle.artifact.digest;
    return { policy, bundle, selection: { projectId, component, now: Date.parse('2030-01-01T00:00:00Z') } };
}
function check(f) { return gate.validate(f.bundle, f.selection, f.policy); }
function changeConfig(f, name, patch)
{
    const c = JSON.parse(f.bundle.artifact.files[name]);
    f.bundle.artifact.files[name] = JSON.stringify({ ...c, ...patch });
    f.bundle.artifact.digest = gate.digest(f.bundle.artifact.files);
    f.bundle.approval.artifactDigest = f.bundle.artifact.digest;
}
test('checked-in policy has no approved target and is not changed by inspect', () =>
{
    assert.equal(gate.digest({ z: 'one', A: 'two' }), gate.digest({ A: 'two', z: 'one' }));
    assert.deepEqual(main(['inspect']), { mode: 'preprod-review-only', approvedTargetCount: 0, cloudExecutionAuthorized: false });
    assert.equal(checkedPolicy.cloudExecutionEnabled, false);
    assert.deepEqual(checkedPolicy.approvedTargets, []);
    const f = fixture();
    assert.throws(() => gate.validate(f.bundle, f.selection, checkedPolicy), /target-not-approved/);
});
for (const component of ['rules', 'functions', 'frontend', 'rollback'])
    test(component + ': synthetic structural match still cannot authorize or execute', () =>
    {
        const f = fixture(component);
        const result = check(f);
        assert.equal(result.structurallyConsistent, true);
        assert.equal(result.cloudExecutionAuthorized, false);
        assert.throws(() => gate.execute(f.bundle, f.selection, f.policy), /phase2b-cloud-execution-disabled/);
    });
const negatives = [
    ['production explicit project', f => { f.selection.projectId = 'liescorecard-70c5e'; }],
    ['production in nested artifact content', f => { f.bundle.artifact.files['unexpected.txt'] = 'LIESCORECARD-70C5E'; }],
    ['missing explicit project', f => { delete f.selection.projectId; }],
    ['missing component', f => { delete f.selection.component; }],
    ['implicit all-component deploy', f => { f.selection.component = 'all'; }],
    ['unapproved project', f => { f.selection.projectId = 'unknown-preprod'; }],
    ['policy execution toggle', f => { f.policy.cloudExecutionEnabled = true; }],
    ['mixed bundle project', f => { f.bundle.projectId = 'other-preprod'; }],
    ['HTTP domain', f => { f.policy.approvedTargets[0].origin = 'http://preprod.example.invalid'; }],
    ['production custom domain', f => { f.policy.approvedTargets[0].origin = 'https://app.lochihnein.de'; }],
    ['malformed domain', f => { f.policy.approvedTargets[0].origin = 'https://bad-.example.invalid'; }],
    ['domain mismatch', f => { changeConfig(f, 'frontend/environment.json', { origin: 'https://other.example.invalid' }); }],
    ['mixed frontend project', f => { changeConfig(f, 'frontend/environment.json', { projectId: 'other-preprod' }); }],
    ['mixed server project', f => { changeConfig(f, 'functions/environment.json', { projectId: 'other-preprod' }); }],
    ['local mode artifact', f => { changeConfig(f, 'frontend/environment.json', { mode: 'local' }); }],
    ['missing banner', f => { changeConfig(f, 'frontend/environment.json', { banner: '' }); }],
    ['old buffer migration', f => { changeConfig(f, 'frontend/environment.json', { legacyBuffers: 'migrate' }); }],
    ['worker enabled', f => { changeConfig(f, 'frontend/environment.json', { serviceWorker: 'enabled' }); }],
    ['mixed hosting project', f => { changeConfig(f, 'deployment/target.json', { hostingProjectId: 'other-preprod' }); }],
    ['CLI default allowed', f => { changeConfig(f, 'deployment/target.json', { defaultProjectAllowed: true }); }],
    ['GAS URL', f => { changeConfig(f, 'functions/environment.json', { gasUrl: 'https://script.google.com/macros/s/SYNTHETIC/exec' }); }],
    ['GAS redirect host', f => { f.bundle.extra = 'https://script.googleusercontent.com/SYNTHETIC'; }],
    ['live mail enabled', f => { changeConfig(f, 'functions/environment.json', { mailMode: 'live' }); }],
    ['missing identity', f => { delete f.bundle.identity; }],
    ['default credentials', f => { f.bundle.identity.defaultCredentials = true; }],
    ['service account key mode', f => { f.bundle.identity.type = 'service-account-key'; }],
    ['foreign identity project', f => { f.bundle.identity.projectId = 'other-preprod'; }],
    ['foreign principal', f => { f.bundle.identity.principal = 'wrong@example.invalid'; }],
    ['production permission declared', f => { f.bundle.identity.productionAccess = 'present'; }],
    ['unreviewed inherited permissions', f => { f.bundle.identity.inheritedPermissionsReviewed = false; }],
    ['missing approval', f => { delete f.bundle.approval; }],
    ['implicit approval', f => { f.bundle.approval.explicit = false; }],
    ['approval for another component', f => { f.bundle.approval.component = 'rules'; }],
    ['expired approval', f => { f.bundle.approval.expiresAt = '2000-01-01T00:00:00Z'; }],
    ['missing review time', f => { delete f.selection.now; }],
    ['tampered artifact digest', f => { f.bundle.artifact.files['unexpected.txt'] = 'changed'; }],
    ['approval for previous artifact', f => { f.bundle.approval.artifactDigest = '0'.repeat(64); }],
    ['credential material field', f => { f.bundle.identity.private_key = 'SYNTHETIC-DENIED-NOT-A-KEY'; }],
    ['unsafe artifact path', f => { f.bundle.artifact.files['../outside'] = 'synthetic'; }]
];
for (const [name, mutation] of negatives)
    test('rejects ' + name, () => { const f = fixture(); mutation(f); assert.throws(() => check(f)); });
test('rollback requires separate previous-artifact and compatibility review', () =>
{
    const f = fixture('rollback');
    delete f.bundle.rollback;
    assert.throws(() => check(f), /rollback-review-required/);
});
test('command parser has no deploy, credential, project-fallback or arbitrary-command option', () =>
{
    for (const args of [[], ['deploy'], ['inspect', '--deploy'], ['check'], ['check', '--project', 'x'],
        ['firebase', 'deploy'], ['inspect', '--token', 'SYNTHETIC-DENIED']]) assert.throws(() => main(args));
});
test('gate module evaluates with only crypto; no network, SDK or child-process capability', () =>
{
    const context = { module: { exports: {} }, require(name) { assert.equal(name, 'node:crypto'); return crypto; }, URL };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'tools/preprod/gate.cjs'), 'utf8'), context);
    const f = fixture();
    assert.equal(context.module.exports.validate(f.bundle, f.selection, f.policy).cloudExecutionAuthorized, false);
    assert.throws(() => context.module.exports.execute(), /phase2b-cloud-execution-disabled/);
});
test('Phase 2A local validator still rejects Cloud mode without SDK initialization', () =>
{
    const { validate } = require('../App_Environment');
    assert.throws(() => validate({ mode: 'preprod', projectId: 'synthetic-preprod-review' }, {}, { hostname: '127.0.0.1', protocol: 'http:' }, []));
    const { profile } = require('../tools/local/profile.cjs');
    assert.throws(() => profile({ GCLOUD_PROJECT: 'synthetic-preprod-review' }));
});
