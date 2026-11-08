// Separate context database: never stores or migrates a V1 buffer or V2 queue.
var app = app || {};

app.createScoreEntryContextStore = function(name)
{
    let connection;
    function open()
    {
        if (!connection)
        {
            connection = new Promise(function(resolve, reject)
            {
                const request = indexedDB.open(name || 'lie_score_entry_context_v2__local:demo-lie-scorecards-local', 1);
                request.onupgradeneeded = function()
                {
                    request.result.createObjectStore('contexts', { keyPath: ['ownerUid', 'playerId', 'spieltagId'] });
                };
                request.onsuccess = function()
                {
                    const db = request.result;
                    db.onversionchange = function()
                    {
                        db.close();
                        connection = null;
                    };
                    resolve(db);
                };
                request.onerror = function()
                {
                    connection = null;
                    reject(request.error);
                };
                request.onblocked = function()
                {
                    connection = null;
                    reject(new Error('Offline context database is blocked.'));
                };
            });
        }
        return connection;
    }
    async function transact(mode, work)
    {
        const db = await open();
        return new Promise(function(resolve, reject)
        {
            const tx = db.transaction('contexts', mode);
            const request = work(tx.objectStore('contexts'));
            tx.oncomplete = function()
            {
                resolve(request.result);
            };
            tx.onerror = tx.onabort = function()
            {
                reject(tx.error || new Error('Offline context storage failed.'));
            };
        });
    }
    return Object.freeze(
    {
        put: function(response)
        {
            const snapshot = structuredClone(response);
            return transact('readwrite', function(store)
            {
                return store.put({ ownerUid: snapshot.ownerUid, playerId: snapshot.playerId,
                    spieltagId: snapshot.spieltagId, flightId: snapshot.flightId,
                    schemaVersion: 1, validatedAt: new Date().toISOString(), response: snapshot });
            });
        },
        get: async function(c)
        {
            const record = await transact('readonly', function(store)
            {
                return store.get([c.ownerUid, c.playerId, c.spieltagId]);
            });
            if (!record || record.schemaVersion !== 1 || record.flightId !== record.response.flightId)
            {
                return null;
            }
            return record.response;
        },
        list: async function(ownerUid)
        {
            const records = await transact('readonly', function(store)
            {
                return store.getAll();
            });
            return records.filter(function(record)
            {
                return record.schemaVersion === 1 && record.ownerUid === ownerUid
                    && record.playerId === ownerUid;
            }).sort(function(a, b)
            {
                return b.validatedAt.localeCompare(a.validatedAt);
            });
        },
        close: async function()
        {
            if (connection)
            {
                (await connection).close();
                connection = null;
            }
        }
    });
};
