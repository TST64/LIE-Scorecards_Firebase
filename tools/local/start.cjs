'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { profile, PROJECT } = require('./profile.cjs');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
if (args.some(x => !['--test', '--rc', '--smoke'].includes(x))
    || new Set(args).size !== args.length || (args.includes('--smoke') && !args.includes('--rc'))
    || (args.includes('--test') && args.includes('--rc'))) throw new Error('Unsupported local command. No deploy command.');
const p = profile();
// CLI discovery intentionally does not inherit arbitrary process variables.
// Supply only a public local-mode marker; refuse existing dotenv files instead of overwriting them.
const dotenv = path.join(root, 'functions', '.env.local');
for (const file of fs.readdirSync(path.join(root, 'functions')).filter(x => x === '.env' || x.startsWith('.env.')))
    if (file !== '.env.local' || fs.readFileSync(dotenv, 'utf8') !== 'LIE_MODE=local\n')
        throw new Error('Unexpected Functions dotenv file; refusing local start.');
if (!fs.existsSync(dotenv)) fs.writeFileSync(dotenv, 'LIE_MODE=local\n', { flag: 'wx' });
const runtime = path.join(root, '.local-runtime');
fs.mkdirSync(runtime, { recursive: true });
const config = path.join(root, '.firebase-local.generated.json');
fs.writeFileSync(config, JSON.stringify({ functions: { source: 'functions', runtime: 'nodejs22' },
    firestore: { rules: 'firestore.rules' },
    emulators: { ...p.emulators, hub: { host: '127.0.0.1', port: 4400 },
        logging: { host: '127.0.0.1', port: 4500 }, ui: { enabled: false }, singleProjectMode: true } }, null, 2));
fs.writeFileSync(path.join(runtime, 'profile.json'), JSON.stringify(p));
const env = { ...process.env, LIE_MODE: 'local', FUNCTIONS_EMULATOR: 'true', GCLOUD_PROJECT: PROJECT, GOOGLE_CLOUD_PROJECT: PROJECT,
    LIE_BROWSER_USERPROFILE: process.env.USERPROFILE || '', LIE_BROWSER_APPDATA: process.env.APPDATA || '',
    LIE_BROWSER_HOME: process.env.HOME || process.env.USERPROFILE || '',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:' + p.emulators.firestore.port,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:' + p.emulators.auth.port,
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_EMULATORS_PATH: path.join(runtime, 'emulators'), CI: 'true', NO_GCE_CHECK: 'true' };
for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN', 'NODE_OPTIONS', 'FIREBASE_CONFIG',
    'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy']) delete env[key];
// Firebase CLI cannot inherit the developer's cached login or gcloud ADC.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'lie-emulator-home-'));
env.HOME = home; env.USERPROFILE = home; env.APPDATA = home; env.CLOUDSDK_CONFIG = home;
env.XDG_CONFIG_HOME = home;
const cli = path.join(root, 'node_modules/firebase-tools/lib/bin/firebase.js');
if (!fs.existsSync(cli)) throw new Error('Run npm ci first (tool download only).');
const command = args.includes('--rc') ? 'node tools/local/rc-session.cjs' + (args.includes('--smoke') ? ' --smoke' : '')
    : 'node tools/local/session.cjs' + (args.includes('--test') ? ' --test' : '');
const child = spawn(process.execPath, [cli, 'emulators:exec', '--config', config, '--project', PROJECT,
    '--only', 'auth,firestore,functions', command], { cwd: root, env, stdio: 'inherit', windowsHide: true });
child.on('error', () => { process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code === null ? 1 : code; });
process.on('SIGINT', () => child.kill('SIGINT'));
