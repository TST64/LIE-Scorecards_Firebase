'use strict';
const PROJECT = 'demo-lie-scorecards-local';
function profile(env = process.env)
{
    if (env.LIE_MODE !== undefined && env.LIE_MODE !== 'local') throw new Error('Conflicting local mode.');
    for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT'])
        if (env[key] !== undefined && env[key] !== PROJECT) throw new Error('Conflicting project environment.');
    if (env.FIREBASE_CONFIG && JSON.parse(env.FIREBASE_CONFIG).projectId !== PROJECT)
        throw new Error('Conflicting Firebase config.');
    const emulators = {};
    for (const [service, fallback] of [['auth', 9099], ['firestore', 8088], ['functions', 5001]])
    {
        const raw = env['LIE_' + service.toUpperCase() + '_PORT'];
        const port = raw === undefined ? fallback : Number(raw);
        if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port.');
        emulators[service] = { host: '127.0.0.1', port };
    }
    if (new Set(Object.values(emulators).map(x => x.port)).size !== 3) throw new Error('Duplicate ports.');
    return { mode: 'local', projectId: PROJECT, emulators };
}
module.exports = { profile, PROJECT };
