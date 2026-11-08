'use strict';
const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
async function probe(profile)
{
    await Promise.all(Object.values(profile.emulators).map(endpoint => new Promise((resolve, reject) =>
    {
        const socket = net.connect(endpoint.port, endpoint.host);
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('error', reject);
        socket.once('timeout', () => { socket.destroy(); reject(new Error('Emulator unavailable.')); });
    })));
}
function createServer(profile)
{
    return http.createServer(async (request, response) =>
    {
        const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' " +
                Object.values(profile.emulators).map(e => 'http://127.0.0.1:' + e.port).join(' ') +
                "; img-src 'self' data:; font-src 'self'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'" };
        try
        {
            // Do not let a remote origin use this file server as a bridge into local emulators.
            const host = request.headers.host || '';
            if (!/^127\.0\.0\.1:\d+$/.test(host) || (request.headers.origin && request.headers.origin !== 'http://' + host))
                throw new Error('Untrusted local origin.');
            if (request.method !== 'GET') throw new Error('Read-only server.');
            const pathname = new URL(request.url, 'http://' + host).pathname;
            if (pathname === '/__local/ready')
            {
                await probe(profile);
                response.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
                response.end(JSON.stringify(profile)); return;
            }
            if (pathname === '/__local/profile.js')
            {
                response.writeHead(200, { ...headers, 'Content-Type': 'application/javascript' });
                response.end('window.LIE_LOCAL_PROFILE = Object.freeze(' + JSON.stringify(profile) + ');'); return;
            }
            let file;
            if (pathname === '/__vendor/tailwind.js') file = path.join(root, 'node_modules/@tailwindcss/browser/dist/index.global.js');
            else if (pathname === '/__vendor/fontawesome/css/all.min.css') file = path.join(root, 'node_modules/@fortawesome/fontawesome-free/css/all.min.css');
            else if (/^\/__vendor\/fontawesome\/webfonts\/[a-z0-9-]+\.(woff2|ttf)$/.test(pathname))
                file = path.join(root, 'node_modules/@fortawesome/fontawesome-free/webfonts', path.basename(pathname));
            else if (/^\/__sdk\/firebase-(app|auth|firestore|functions)-compat\.js$/.test(pathname))
                file = path.join(root, 'node_modules/firebase', path.basename(pathname));
            else if (pathname === '/' || pathname === '/index.html') file = path.join(root, 'index.html');
            else if (/^\/[A-Za-z][A-Za-z_0-9-]*\.(js|css|html|json|ico)$/.test(pathname) && !pathname.includes('sw.js'))
                file = path.join(root, pathname.slice(1));
            else if (/^\/img\/[\w .-]+\.(png|jpe?g)$/i.test(decodeURIComponent(pathname)))
                file = path.join(root, decodeURIComponent(pathname).slice(1));
            else throw new Error('Path not served.');
            const data = await fs.readFile(file);
            const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
            response.writeHead(200, { ...headers, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
            response.end(data);
        }
        catch (_) { response.writeHead(503, headers); response.end('Local resource unavailable.'); }
    });
}
module.exports = { createServer, probe };
