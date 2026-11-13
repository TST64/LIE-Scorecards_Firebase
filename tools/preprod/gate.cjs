'use strict';
// Offline structural review ONLY. This module cannot execute a deployment.
const crypto = require('node:crypto');
const LOCKED_PROJECT = 'liescorecard-70c5e';
const COMPONENTS = ['rules', 'functions', 'frontend', 'rollback'];
function deny(code) { const error = new Error(code); error.code = code; throw error; }
function digest(files)
{
    return crypto.createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))).digest('hex');
}
function inspect(value)
{
    if (value === null || value === undefined) return;
    if (typeof value === 'string')
    {
        if (value.toLowerCase().includes(LOCKED_PROJECT)) deny('production-project-forbidden');
        if (/script\.(google|googleusercontent)\.com|script\.googleusercontent\.com|googleusercontent\.com\/macros/i.test(value)) deny('gas-forbidden');
        if (/-----BEGIN [\w ]*PRIVATE KEY-----|\beyJ[\w-]+\.[\w-]+\.[\w-]+/.test(value)) deny('credential-material-forbidden');
    }
    else if (typeof value === 'object')
    {
        for (const [key, item] of Object.entries(value))
        {
            if (/^(private_key|privateKey|access_token|refresh_token|token|client_secret|password)$/i.test(key)) deny('credential-material-forbidden');
            inspect(item);
        }
    }
}
function parsePublicConfig(files, name)
{
    try { return JSON.parse(files[name]); } catch (_) { deny('invalid-artifact-config'); }
}
function validate(bundle, selection, policy)
{
    if (!selection || !selection.projectId || !selection.component) deny('explicit-selection-required');
    inspect(selection); inspect(bundle);
    if (!policy || policy.schemaVersion !== 1 || policy.mode !== 'preprod-review-only'
        || policy.cloudExecutionEnabled !== false || !Array.isArray(policy.approvedTargets)) deny('policy-invalid');
    inspect(policy.approvedTargets);
    if (!COMPONENTS.includes(selection.component)) deny('component-forbidden');
    const target = policy.approvedTargets.find(t => t.projectId === selection.projectId);
    if (!target) deny('target-not-approved');
    if (!/^[a-z][a-z0-9-]{5,29}$/.test(target.projectId) || target.projectId.startsWith('demo-')) deny('project-invalid');
    if (!/^https:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(target.origin)
        || /localhost|127\.0\.0\.1|lochihnein\.de|tst64\.github\.io/i.test(target.origin)
        || target.origin.includes('..')) deny('origin-invalid');
    const domain = new URL(target.origin).hostname;
    if (domain.length > 253 || domain.split('.').length < 2 || domain.split('.').some(label =>
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) deny('origin-invalid');
    if (target.region !== 'europe-west1') deny('region-not-reviewed');
    if (!bundle || bundle.schemaVersion !== 1 || bundle.mode !== 'preprod' || bundle.projectId !== target.projectId) deny('bundle-project-mismatch');
    const artifact = bundle.artifact;
    if (!artifact || !artifact.files || typeof artifact.files !== 'object' || Array.isArray(artifact.files)) deny('artifact-required');
    const entries = Object.entries(artifact.files);
    if (!entries.length || entries.some(([name, value]) => !/^[a-zA-Z0-9_./-]+$/.test(name)
        || name.startsWith('/') || name.split('/').some(p => p === '..' || p === '.')
        || typeof value !== 'string')) deny('artifact-invalid');
    if (artifact.digest !== digest(artifact.files)) deny('artifact-digest-mismatch');
    const frontend = parsePublicConfig(artifact.files, 'frontend/environment.json');
    const server = parsePublicConfig(artifact.files, 'functions/environment.json');
    const deployment = parsePublicConfig(artifact.files, 'deployment/target.json');
    inspect(frontend); inspect(server); inspect(deployment);
    for (const c of [frontend, server, deployment])
        if (c.mode !== 'preprod' || c.projectId !== target.projectId || c.region !== target.region) deny('artifact-environment-mismatch');
    if (frontend.origin !== target.origin || frontend.authDomain !== target.projectId + '.firebaseapp.com'
        || frontend.banner !== 'PREPROD — SYNTHETIC TEST DATA'
        || frontend.storageNamespace !== 'preprod:' + target.projectId
        || frontend.serviceWorker !== 'disabled' || frontend.legacyBuffers !== 'quarantined') deny('frontend-boundary-invalid');
    if (server.mailMode !== 'disabled' || server.gasUrl !== null || server.dataPolicy !== 'synthetic-only') deny('server-boundary-invalid');
    if (deployment.origin !== target.origin || deployment.hostingProjectId !== target.projectId
        || deployment.credentialProjectId !== target.projectId || deployment.defaultProjectAllowed !== false) deny('deploy-target-mismatch');
    const identity = bundle.identity;
    if (!identity || identity.projectId !== target.projectId || identity.type !== 'workload-identity'
        || !target.principals || identity.principal !== target.principals[selection.component]
        || !identity.principal || !identity.principal.endsWith('@' + target.projectId + '.iam.gserviceaccount.com')
        || identity.defaultCredentials !== false || identity.productionAccess !== 'absent'
        || identity.inheritedPermissionsReviewed !== true || !identity.evidenceReference) deny('identity-review-required');
    // These are untrusted offline declarations, not verified IAM or signed approval evidence.
    const approval = bundle.approval;
    if (!approval || approval.explicit !== true || approval.component !== selection.component
        || approval.projectId !== target.projectId || approval.artifactDigest !== artifact.digest
        || !approval.reference || !approval.reviewer || !approval.expiresAt
        || !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= selection.now) deny('approval-required');
    if (!Number.isFinite(selection.now)) deny('review-time-required');
    if (selection.component === 'rollback' && (!bundle.rollback || bundle.rollback.targetProjectId !== target.projectId
        || !/^[a-f0-9]{64}$/.test(bundle.rollback.previousArtifactDigest || '') || !bundle.rollback.compatibilityReviewed)) deny('rollback-review-required');
    return Object.freeze({ structurallyConsistent: true, projectId: target.projectId, component: selection.component,
        artifactDigest: artifact.digest, cloudExecutionAuthorized: false,
        remainingGate: 'separate-reviewed-cloud-authorization-and-trusted-IAM-evidence-required' });
}
function execute()
{
    // Unconditional lock, independent of policy files, arguments, approvals and environment.
    deny('phase2b-cloud-execution-disabled');
}
module.exports = { validate, digest, execute };
