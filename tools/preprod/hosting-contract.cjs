'use strict';
// Pure in-memory proposal review. No CLI, network, filesystem scan or deployment.
const policy = require('../../config/preprod/policy.json');
const { digest } = require('./gate.cjs');
const PUBLIC_FILES = Object.freeze(['index.html', '404.html', 'assets/app.bundle.js', 'assets/app.css',
    'assets/environment.json', 'assets/logo.png', 'assets/vendor/firebase-app-compat.js',
    'assets/vendor/firebase-auth-compat.js', 'assets/vendor/firebase-firestore-compat.js', 'assets/vendor/firebase-functions-compat.js']);
const IGNORE = Object.freeze(['firebase.proposal.json', '**/.*', '**/node_modules/**', '**/functions/**', '**/tests/**', '**/*.map', '**/CNAME', '**/config.js']);
function reject(code) { throw new Error(code); }
function csp(projectId)
{
    return "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://europe-west1-" + projectId + ".cloudfunctions.net; img-src 'self' data:; font-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";
}
function scan(value)
{
    const text = JSON.stringify(value);
    if (/liescorecard-70c5e|lochihnein\.de|tst64\.github\.io/i.test(text)) reject('production-reference');
    if (/script\.(google|googleusercontent)\.com|googleusercontent\.com\/macros/i.test(text)) reject('gas-reference');
    if (/-----BEGIN [\w ]*PRIVATE KEY-----|private_key|client_secret|access_token|refresh_token/i.test(text)) reject('secret-material');
    if (/sourceMappingURL/i.test(text)) reject('source-map-reference');
}
function validate(review)
{
    if (policy.cloudExecutionEnabled !== false || policy.approvedTargets.length !== 0) reject('policy-must-remain-locked');
    scan(review);
    if (!review || review.mode !== 'hosting-review-only' || review.cloudExecutionEnabled !== false) reject('review-only-required');
    const id = review.projectId;
    if (typeof id !== 'string' || !/^[a-z][a-z0-9-]{5,29}$/.test(id) || id.startsWith('demo-')) reject('project-invalid');
    if (review.siteId !== id || review.origin !== 'https://' + id + '.web.app'
        || review.customDomainAllowed !== false || review.dnsChangesAllowed !== false
        || review.hostingActivated !== false || review.originVerified !== false) reject('standard-host-review-required');
    const auth = review.auth;
    if (!auth || auth.projectId !== id || auth.authDomain !== id + '.firebaseapp.com'
        || JSON.stringify(auth.authorizedDomains) !== JSON.stringify([id + '.web.app', id + '.firebaseapp.com'])) reject('auth-host-mismatch');
    const f = review.frontend;
    if (!f || f.projectId !== id || f.origin !== review.origin || f.banner !== 'PREPROD — SYNTHETIC TEST DATA'
        || f.storageNamespace !== 'preprod:' + id || f.serviceWorker !== 'disabled'
        || f.legacyBuffers !== 'quarantined' || f.mailMode !== 'disabled' || f.gasUrl !== null) reject('frontend-boundary');
    if (!review.functions || review.functions.projectId !== id || review.functions.region !== 'europe-west1') reject('functions-mismatch');
    const config = review.config;
    if (!config || JSON.stringify(Object.keys(config)) !== '["hosting"]') reject('hosting-only-config-required');
    const h = config.hosting;
    if (!h || Array.isArray(h) || Object.keys(h).sort().join(',') !== 'headers,ignore,public,rewrites,site'
        || h.site !== id || h.public !== 'hosting-public' || JSON.stringify(h.ignore) !== JSON.stringify(IGNORE)) reject('public-root-or-exclusions');
    if (JSON.stringify(h.rewrites) !== JSON.stringify([{ source: '/app', destination: '/index.html' }, { source: '/app/**', destination: '/index.html' }])) reject('unsafe-rewrite');
    const expectedHeaders = [{ source: '**', headers: [
        { key: 'Cache-Control', value: 'no-store' }, { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Content-Security-Policy', value: csp(id) }] }];
    if (JSON.stringify(h.headers) !== JSON.stringify(expectedHeaders)) reject('cache-or-csp-mismatch');
    const artifact = review.artifact;
    if (!artifact || !artifact.files || Array.isArray(artifact.files)
        || Object.keys(artifact.files).sort().join(',') !== [...PUBLIC_FILES].sort().join(',')) reject('public-file-allowlist');
    for (const [name, entry] of Object.entries(artifact.files))
        if (!entry || entry.kind !== 'regular-file' || typeof entry.content !== 'string'
            || Object.keys(entry).sort().join(',') !== 'content,kind' || !PUBLIC_FILES.includes(name)) reject('regular-files-only');
    if (artifact.digest !== digest(artifact.files)) reject('artifact-digest-mismatch');
    let env;
    try { env = JSON.parse(artifact.files['assets/environment.json'].content); } catch (_) { reject('public-config-invalid'); }
    if (JSON.stringify(env) !== JSON.stringify({ ...f, authDomain: auth.authDomain, region: review.functions.region })) reject('public-config-mismatch');
    return Object.freeze({ structurallyConsistent: true, standardOriginProposal: review.origin,
        cloudExecutionAuthorized: false, hostingActivated: false, publicFileCount: PUBLIC_FILES.length });
}
module.exports = { validate, csp, PUBLIC_FILES };
