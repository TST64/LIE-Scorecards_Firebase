'use strict';
// Defense in depth for local Node app/test processes. Reject before socket creation.
const net = require('node:net');
const tls = require('node:tls');
function check(args)
{
    if (Array.isArray(args[0])) args = args[0];
    let host;
    if (typeof args[0] === 'object') host = args[0].host || args[0].hostname || 'localhost';
    else if (typeof args[0] === 'number') host = typeof args[1] === 'string' ? args[1] : 'localhost';
    else throw new Error('Local network guard: unsupported connection.');
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('Local network guard blocked non-loopback connection.');
}
for (const [object, key] of [[net.Socket.prototype, 'connect'], [tls, 'connect']])
{
    const original = object[key];
    object[key] = function(...args) { check(args); return original.apply(this, args); };
}
