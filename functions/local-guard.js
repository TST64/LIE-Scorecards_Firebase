'use strict';
const PROJECT = 'demo-lie-scorecards-local';
function validate(env)
{
    for (const [key, expected] of [['LIE_MODE', 'local'], ['FUNCTIONS_EMULATOR', 'true'], ['GCLOUD_PROJECT', PROJECT]])
        if (env[key] !== expected) throw new Error('Local environment rejected: ' + key);
    if ((env.GOOGLE_CLOUD_PROJECT && env.GOOGLE_CLOUD_PROJECT !== PROJECT)
        || env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_TOKEN)
        throw new Error('Local environment rejected: Cloud credentials or mixed project.');
    for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST'])
    {
        const match = /^127\.0\.0\.1:(\d+)$/.exec(env[key] || '');
        if (!match || Number(match[1]) < 1024 || Number(match[1]) > 65535)
            throw new Error('Missing loopback emulator: ' + key);
    }
    if (env.FIREBASE_CONFIG)
    {
        const config = JSON.parse(env.FIREBASE_CONFIG);
        if (config.projectId !== PROJECT) throw new Error('Mixed Firebase project.');
    }
    return { projectId: PROJECT };
}
function credential(admin)
{
    // Admin Firestore requires a recognized credential class. Generate a synthetic
    // signing key in memory; never load ADC, a file or a real service account.
    const { privateKey } = require('node:crypto').generateKeyPairSync('rsa', {
        modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' } });
    return admin.credential.cert({ projectId: PROJECT,
        clientEmail: 'local-emulator@' + PROJECT + '.iam.gserviceaccount.com', privateKey });
}
async function disabledMail()
{
    // Do not log player IDs, PINs, recipients or message bodies.
    return { ok: true, text: async () => '{"success":true,"delivery":"local-disabled"}' };
}
module.exports = { validate, credential, disabledMail, PROJECT };
