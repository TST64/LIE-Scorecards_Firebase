// =========================================================================
// Isolated IndexedDB infrastructure. No Firestore or legacy state integration.
// =========================================================================
var app = app || {};

app.createScoreSyncStore = function(databaseName)
{
    'use strict';

    const name = databaseName || 'lie_score_sync_v2';
    const fields = ['strokes', 'puts', 'lady', 'maxscore'];
    const stores = ['pendingOperations', 'serverCache', 'requestSnapshots', 'operationReceipts', 'operationIssues'];
    let connection = null;

    function context(input)
    {
        const result = {};
        ['ownerUid', 'playerId', 'spieltagId', 'flightId'].forEach(function(key)
        {
            if (!input || typeof input[key] !== 'string' || !input[key].trim())
            {
                throw new Error('Missing score context: ' + key);
            }
            result[key] = input[key].trim();
        });
        return result;
    }

    function partition(input)
    {
        const c = context(input);
        return [c.ownerUid, c.playerId, c.spieltagId, c.flightId];
    }

    function documentContext(input)
    {
        const c = context(input);
        if (typeof input.spielerId !== 'string' || !input.spielerId.trim()
            || !Number.isInteger(input.hole) || input.hole < 1 || input.hole > 18)
        {
            throw new Error('Invalid scorecard player or hole.');
        }
        c.spielerId = input.spielerId.trim();
        c.hole = input.hole;
        c.documentId = 'SC-' + c.spieltagId + '-' + c.spielerId + '-' + c.hole;
        if (input.documentId !== c.documentId)
        {
            throw new Error('Scorecard document ID does not match its context.');
        }
        return c;
    }

    function validRevision(value)
    {
        return Number.isSafeInteger(value) && value >= 0;
    }

    function scoreError(code, message)
    {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function resolutionExpectation(cached, pending, field)
    {
        return {
            changeIds: sorted(pending).filter(function(op)
            {
                return op.field === field;
            }).map(function(op)
            {
                return op.changeId;
            }),
            generation: cached?.generation ?? null,
            fieldRevision: validRevision(cached?.fieldRevisions?.[field]) ? cached.fieldRevisions[field] : null
        };
    }

    function validateValue(field, value)
    {
        if (!fields.includes(field))
        {
            throw new Error('Unsupported score field: ' + field);
        }
        if (field === 'lady' || field === 'maxscore')
        {
            if (typeof value !== 'boolean')
            {
                throw new Error('Boolean score field requires a boolean.');
            }
        }
        else if (!Number.isSafeInteger(value) || value < (field === 'strokes' ? 1 : 0))
        {
            throw new Error('Invalid numeric score value.');
        }
    }

    function validateChanges(changes)
    {
        if (!Array.isArray(changes) || !changes.length)
        {
            throw new Error('At least one field operation is required.');
        }
        const seen = new Set();
        return changes.map(function(change)
        {
            if (!fields.includes(change.field) || seen.has(change.field)
                || !['set', 'delete'].includes(change.operation))
            {
                throw new Error('Invalid or duplicate field operation.');
            }
            seen.add(change.field);
            if (change.operation === 'set')
            {
                validateValue(change.field, change.value);
            }
            else if (change.value !== null)
            {
                throw new Error('Delete operations require value: null.');
            }
            return { field: change.field, operation: change.operation, value: change.value };
        });
    }

    function open()
    {
        if (connection)
        {
            return connection;
        }
        connection = new Promise(function(resolve, reject)
        {
            let blocked = false;
            const request = indexedDB.open(name, 3);
            request.onupgradeneeded = function()
            {
                const db = request.result;
                stores.forEach(function(storeName)
                {
                    if (db.objectStoreNames.contains(storeName))
                    {
                        return;
                    }
                    const keyPath = storeName === 'pendingOperations' ? 'sequence'
                        : storeName === 'serverCache' ? ['ownerUid', 'playerId', 'spieltagId', 'flightId', 'documentId']
                            : storeName === 'requestSnapshots' ? 'requestId' : 'changeId';
                    const store = db.createObjectStore(storeName,
                        { keyPath: keyPath, autoIncrement: storeName === 'pendingOperations' });
                    store.createIndex('partition', ['ownerUid', 'playerId', 'spieltagId', 'flightId']);
                    if (storeName === 'pendingOperations')
                    {
                        store.createIndex('changeId', 'changeId', { unique: true });
                    }
                });
            };
            request.onerror = function()
            {
                connection = null;
                reject(request.error);
            };
            request.onblocked = function()
            {
                blocked = true;
                connection = null;
                reject(new Error('Score storage upgrade blocked by another tab.'));
            };
            request.onsuccess = function()
            {
                const db = request.result;
                if (blocked)
                {
                    db.close();
                    return;
                }
                db.onversionchange = function()
                {
                    db.close();
                    connection = null;
                };
                db.onclose = function()
                {
                    connection = null;
                };
                resolve(db);
            };
        });
        return connection;
    }

    async function transact(scope, mode, work)
    {
        const db = await open();
        return new Promise(function(resolve, reject)
        {
            const tx = db.transaction(scope, mode);
            let result;
            let failure;
            function abort(error)
            {
                failure = error;
                tx.abort();
            }
            tx.oncomplete = function()
            {
                resolve(result);
            };
            tx.onabort = function()
            {
                reject(failure || tx.error || new Error('Score storage transaction aborted.'));
            };
            try
            {
                work(tx, function(value) { result = value; }, abort);
            }
            catch (error)
            {
                abort(error);
            }
        });
    }

    // Only IDB callbacks are used inside a transaction; no external await gap.
    function load(tx, c, ready, abort)
    {
        const data = {};
        let remaining = stores.length;
        stores.forEach(function(storeName)
        {
            const request = tx.objectStore(storeName).index('partition').getAll(partition(c));
            request.onsuccess = function()
            {
                data[storeName] = request.result;
                if (--remaining === 0)
                {
                    try
                    {
                        ready(data);
                    }
                    catch (error)
                    {
                        abort(error);
                    }
                }
            };
        });
    }

    function sorted(operations)
    {
        return operations.slice().sort(function(a, b) { return a.sequence - b.sequence; });
    }

    function makeOperation(c, change, cache, parent)
    {
        return Object.assign({}, c, change,
        {
            changeId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            // Immutable editing basis. An own predecessor is resolved from its
            // applied receipt, never from a later cache revision.
            baseFieldRevision: parent ? parent.baseFieldRevision ?? null : cache?.fieldRevisions?.[change.field] ?? null,
            baseDocumentGeneration: parent ? parent.baseDocumentGeneration ?? null : cache?.generation ?? null,
            predecessorChangeId: parent ? parent.changeId : null
        });
    }

    async function appendChanges(input, changes)
    {
        const c = documentContext(input);
        const checked = validateChanges(changes);
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const cache = data.serverCache.find(function(card) { return card.documentId === c.documentId; });
                const pending = sorted(data.pendingOperations);
                const records = checked.map(function(change)
                {
                    const parent = pending.filter(function(op)
                    {
                        return op.documentId === c.documentId && op.field === change.field;
                    }).pop();
                    const record = makeOperation(c, change, cache, parent);
                    const request = tx.objectStore('pendingOperations').add(record);
                    request.onsuccess = function() { record.sequence = request.result; };
                    return record;
                });
                done(records);
            }, abort);
        });
    }

    function mergeField(cache, field, value, deleted, revision)
    {
        const previous = cache.fieldRevisions[field];
        if (validRevision(previous) && (!validRevision(revision) || revision < previous))
        {
            return;
        }
        if (validRevision(previous) && previous === revision
            && (Object.hasOwn(cache.values, field) === deleted || (!deleted && cache.values[field] !== value)))
        {
            throw new Error('Inconsistent confirmed values at the same field revision.');
        }
        if (deleted)
        {
            delete cache.values[field];
        }
        else
        {
            cache.values[field] = value;
        }
        if (validRevision(revision))
        {
            cache.fieldRevisions[field] = revision;
        }
    }

    async function writeServerSnapshot(input, values, fieldRevisions, info, replaceGeneration)
    {
        const c = documentContext(input);
        const snapshot = Object.assign({}, values);
        const revisions = Object.assign({}, fieldRevisions || {});
        const metadata = Object.assign({}, info || {});
        Object.keys(snapshot).forEach(function(field) { validateValue(field, snapshot[field]); });
        Object.keys(revisions).forEach(function(field)
        {
            if (!fields.includes(field) || !validRevision(revisions[field]))
            {
                throw new Error('Invalid confirmed field revision.');
            }
        });
        if (metadata.generation !== undefined && (typeof metadata.generation !== 'string' || !metadata.generation))
        {
            throw new Error('Invalid confirmed document generation.');
        }
        if (Object.keys(revisions).length && !metadata.generation)
        {
            throw scoreError('generation-required', 'Versioned server data requires an explicit generation.');
        }
        if (replaceGeneration && (!metadata.generation || typeof metadata.replacesGeneration !== 'string'
            || !metadata.replacesGeneration || !fields.every(function(field)
            {
                return validRevision(revisions[field]);
            })))
        {
            throw scoreError('invalid-generation-transition', 'Lifecycle replacement requires an expected generation and complete field revisions.');
        }
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                let cached = data.serverCache.find(function(card) { return card.documentId === c.documentId; });
                const versioned = !!cached?.generation || Object.values(cached?.fieldRevisions || {}).some(validRevision);
                if (versioned && !metadata.generation)
                {
                    throw scoreError('generation-required', 'Unversioned data cannot update a versioned server cache.');
                }
                if (replaceGeneration)
                {
                    if (cached?.generation !== metadata.replacesGeneration || metadata.generation === cached.generation)
                    {
                        throw scoreError('stale-generation-transition', 'The expected lifecycle no longer matches the cache.');
                    }
                    cached = null;
                }
                else if (cached?.generation && metadata.generation !== cached.generation)
                {
                    throw scoreError('generation-mismatch', 'A refresh cannot replace the cached document generation.');
                }
                else if (cached && !cached.generation && metadata.generation)
                {
                    // Bind legacy data only through a complete authoritative read.
                    // Unknown legacy values/revisions are not carried into this lifecycle.
                    if (!fields.every(function(field)
                    {
                        return validRevision(revisions[field]);
                    }))
                    {
                        throw scoreError('legacy-snapshot-incomplete', 'Binding a legacy cache requires a complete versioned server snapshot.');
                    }
                    cached = null;
                }
                cached = cached || Object.assign({}, c, { values: {}, fieldRevisions: {} });
                cached.fieldRevisions = cached.fieldRevisions || {};
                Object.keys(Object.assign({}, snapshot, revisions)).forEach(function(field)
                {
                    mergeField(cached, field, snapshot[field], !Object.hasOwn(snapshot, field), revisions[field]);
                });
                if (metadata.generation)
                {
                    cached.generation = metadata.generation;
                }
                cached.cachedAt = new Date().toISOString();
                tx.objectStore('serverCache').put(cached);
                done(cached);
            }, abort);
        });
    }

    function putServerSnapshot(input, values, fieldRevisions, info)
    {
        return writeServerSnapshot(input, values, fieldRevisions, info, false);
    }

    // Explicit lifecycle replacement, separate from ordinary server refreshes.
    function replaceServerGeneration(input, values, fieldRevisions, info)
    {
        return writeServerSnapshot(input, values, fieldRevisions, info, true);
    }

    async function inspect(input)
    {
        const c = context(input);
        return transact(stores, 'readonly', function(tx, done, abort) { load(tx, c, done, abort); });
    }

    async function readScorecard(input)
    {
        const c = documentContext(input);
        const data = await inspect(c);
        const cached = data.serverCache.find(function(card) { return card.documentId === c.documentId; });
        const confirmed = Object.assign({}, cached?.values);
        const displayed = Object.assign({}, confirmed);
        const pending = sorted(data.pendingOperations.filter(function(op) { return op.documentId === c.documentId; }));
        pending.forEach(function(op)
        {
            if (op.operation === 'delete')
            {
                delete displayed[op.field];
            }
            else
            {
                displayed[op.field] = op.value;
            }
        });
        const expectations = Object.fromEntries(fields.map(function(field)
        {
            return [field, freeze(resolutionExpectation(cached, pending, field))];
        }));
        return { confirmed: confirmed, displayed: displayed, pendingOperations: pending,
            resolutionExpectations: freeze(expectations),
            fieldRevisions: Object.assign({}, cached?.fieldRevisions), generation: cached?.generation,
            syncIssues: data.operationIssues.filter(function(issue)
            {
                return pending.some(function(op) { return op.changeId === issue.changeId; });
            }) };
    }

    function freeze(value)
    {
        if (value && typeof value === 'object')
        {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    }

    function requireRequest(record, c)
    {
        if (!record || partition(record).some(function(value, index) { return value !== partition(c)[index]; }))
        {
            throw new Error('Request not found in the exact score context.');
        }
    }

    function issue(tx, op, reason, status)
    {
        const entry = Object.assign({}, context(op), { changeId: op.changeId, documentId: op.documentId,
            field: op.field, status: status || 'blocked', reason: reason });
        tx.objectStore('operationIssues').put(entry);
    }

    async function createRequestSnapshot(input, options)
    {
        const c = context(input);
        const v2 = options && options.protocol === 'score-v2';
        const mode = input.mode;
        if (v2 && !['ownFlight', 'selectedFlight'].includes(mode))
        {
            throw new Error('An explicit V2 flight mode is required.');
        }
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                let operations = sorted(data.pendingOperations);
                if (v2)
                {
                    // Atomic get-or-create: two connections can send the same immutable
                    // request, but cannot reserve different requests for the same work.
                    const existing = data.requestSnapshots.find(function(record)
                    {
                        return record.protocol === 'score-v2' && record.status === 'prepared'
                            && record.changeIds.some(function(id) { return operations.some(function(op) { return op.changeId === id; }); });
                    });
                    if (existing)
                    {
                        if (existing.mode !== mode)
                        {
                            throw new Error('An unresolved request exists in a different flight mode.');
                        }
                        done(freeze(existing));
                        return;
                    }
                    const seen = new Set();
                    const selected = [];
                    operations.forEach(function(op)
                    {
                        const key = JSON.stringify([op.documentId, op.field]);
                        if (seen.has(key) || selected.length >= 100)
                        {
                            return;
                        }
                        seen.add(key);
                        if (data.operationIssues.some(function(entry) { return entry.changeId === op.changeId; }))
                        {
                            return;
                        }
                        let revision = op.baseFieldRevision;
                        let generation = op.baseDocumentGeneration;
                        if (op.predecessorChangeId)
                        {
                            const predecessor = data.operationReceipts.find(function(receipt)
                            {
                                return receipt.changeId === op.predecessorChangeId && receipt.status === 'acknowledged';
                            });
                            if (!predecessor)
                            {
                                issue(tx, op, 'predecessor-not-acknowledged');
                                return;
                            }
                            revision = predecessor.appliedFieldRevision;
                            generation = predecessor.appliedDocumentGeneration;
                        }
                        if (!validRevision(revision) || typeof generation !== 'string' || !generation)
                        {
                            issue(tx, op, 'missing-editing-basis');
                            return;
                        }
                        const wire = Object.assign({}, documentContext(op),
                        {
                            field: op.field, operation: op.operation, value: op.value,
                            changeId: op.changeId, createdAt: op.createdAt,
                            baseFieldRevision: revision, baseDocumentGeneration: generation
                        });
                        selected.push(wire);
                    });
                    operations = selected;
                }
                if (!operations.length)
                {
                    done(null);
                    return;
                }
                const snapshot = Object.assign({}, c, { requestId: crypto.randomUUID(), createdAt: new Date().toISOString(),
                    operations: operations, changeIds: operations.map(function(op) { return op.changeId; }) });
                if (v2)
                {
                    snapshot.protocol = 'score-v2';
                    snapshot.mode = mode;
                    snapshot.wireRequest = Object.assign({}, c, { requestId: snapshot.requestId, mode: mode, operations: operations });
                }
                tx.objectStore('requestSnapshots').add(Object.assign({}, snapshot, { acknowledgedChangeIds: [], status: 'prepared' }));
                done(freeze(snapshot));
            }, abort);
        });
    }

    async function getRequestSnapshot(input, requestId)
    {
        const c = context(input);
        return transact(stores, 'readonly', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const record = data.requestSnapshots.find(function(item) { return item.requestId === requestId; });
                requireRequest(record, c);
                done(freeze(record));
            }, abort);
        });
    }

    // Re-open a completed request atomically before retrying it. This prevents
    // another tab from discarding/rebasing an operation while that retry starts.
    async function prepareRequestRetry(input, requestId)
    {
        const c = context(input);
        const mode = input.mode;
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const record = data.requestSnapshots.find(function(item) { return item.requestId === requestId; });
                requireRequest(record, c);
                if (record.protocol !== 'score-v2' || record.mode !== mode
                    || data.operationReceipts.some(function(receipt)
                    {
                        return record.changeIds.includes(receipt.changeId)
                            && ['superseded', 'discarded'].includes(receipt.status);
                    }))
                {
                    throw new Error('Resolved operations or a different mode cannot be retried.');
                }
                if (data.requestSnapshots.some(function(other)
                {
                    return other.requestId !== requestId && other.protocol === 'score-v2' && other.status === 'prepared'
                        && other.changeIds.some(function(id) { return data.pendingOperations.some(function(op) { return op.changeId === id; }); });
                }))
                {
                    throw new Error('Another request is already prepared for this flight.');
                }
                record.status = 'prepared';
                tx.objectStore('requestSnapshots').put(record);
                done(freeze(record));
            }, abort);
        });
    }

    function validateResults(record, ids, results)
    {
        if (!Array.isArray(results) || results.length !== record.operations.length
            || new Set(results.map(function(entry) { return entry.changeId; })).size !== results.length)
        {
            throw new Error('A complete V2 operation response is required.');
        }
        results.forEach(function(entry)
        {
            const op = record.operations.find(function(item) { return item.changeId === entry.changeId; });
            if (!op || entry.documentId !== op.documentId || entry.field !== op.field
                || !['acknowledged', 'conflict', 'rejected'].includes(entry.status)
                || (entry.currentServerRevision !== null && !validRevision(entry.currentServerRevision)))
            {
                throw new Error('Invalid V2 operation response.');
            }
            if (entry.status === 'acknowledged')
            {
                if (!ids.includes(entry.changeId) || !validRevision(entry.currentServerRevision)
                    || entry.appliedFieldRevision !== op.baseFieldRevision + 1
                    || entry.currentServerRevision < entry.appliedFieldRevision
                    || typeof entry.currentDocumentGeneration !== 'string'
                    || entry.appliedDocumentGeneration !== entry.currentDocumentGeneration
                    || (op.baseDocumentGeneration !== 'absent' && op.baseDocumentGeneration !== entry.appliedDocumentGeneration)
                    || typeof entry.currentServerDeleted !== 'boolean')
                {
                    throw new Error('Invalid V2 acknowledgement or applied mutation lineage.');
                }
                if (!entry.currentServerDeleted)
                {
                    validateValue(entry.field, entry.currentServerValue);
                }
            }
            else if (ids.includes(entry.changeId) || (entry.status === 'conflict' && entry.currentServerRevision === null))
            {
                throw new Error('Only acknowledged changes may be removed.');
            }
        });
        if (ids.some(function(id)
        {
            return !results.some(function(entry) { return entry.changeId === id && entry.status === 'acknowledged'; });
        }))
        {
            throw new Error('Unconfirmed change ID.');
        }
    }

    async function acknowledgeRequest(input, requestId, changeIds, fieldResults)
    {
        const c = context(input);
        if (!Array.isArray(changeIds) || changeIds.some(function(id) { return typeof id !== 'string' || !id; }))
        {
            throw new Error('Acknowledgement requires explicit change IDs.');
        }
        const ids = Array.from(new Set(changeIds));
        const results = fieldResults === undefined ? undefined : JSON.parse(JSON.stringify(fieldResults));
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const record = data.requestSnapshots.find(function(item) { return item.requestId === requestId; });
                requireRequest(record, c);
                if (ids.some(function(id) { return !record.changeIds.includes(id); }))
                {
                    throw new Error('Acknowledged change is not part of this request.');
                }
                if (record.protocol === 'score-v2')
                {
                    validateResults(record, ids, results);
                    record.fieldResults = results;
                    results.forEach(function(entry)
                    {
                        const op = record.operations.find(function(item) { return item.changeId === entry.changeId; });
                        if (entry.status !== 'acknowledged')
                        {
                            if (data.pendingOperations.some(function(item) { return item.changeId === op.changeId; }))
                            {
                                tx.objectStore('operationIssues').put(Object.assign({}, c, entry));
                            }
                            return;
                        }
                        let cached = data.serverCache.find(function(card) { return card.documentId === op.documentId; });
                        if (!cached)
                        {
                            cached = Object.assign({}, documentContext(op), { values: {}, fieldRevisions: {} });
                            data.serverCache.push(cached);
                        }
                        cached.fieldRevisions = cached.fieldRevisions || {};
                        if (!cached.generation || cached.generation === entry.currentDocumentGeneration
                            || (cached.generation === 'absent' && op.baseDocumentGeneration === 'absent'))
                        {
                            cached.generation = entry.currentDocumentGeneration;
                            mergeField(cached, entry.field, entry.currentServerValue, entry.currentServerDeleted, entry.currentServerRevision);
                            cached.cachedAt = new Date().toISOString();
                            tx.objectStore('serverCache').put(cached);
                        }
                        // The applied revision is not the possibly newer current revision.
                        const priorReceipt = data.operationReceipts.find(function(item) { return item.changeId === op.changeId; });
                        tx.objectStore('operationReceipts').put(Object.assign({}, priorReceipt, c, { changeId: op.changeId,
                            documentId: op.documentId, field: op.field, status: 'acknowledged',
                            appliedFieldRevision: entry.appliedFieldRevision,
                            appliedDocumentGeneration: entry.appliedDocumentGeneration }));
                        tx.objectStore('operationIssues').delete(op.changeId);
                    });
                }
                ids.forEach(function(id)
                {
                    const op = data.pendingOperations.find(function(item) { return item.changeId === id; });
                    if (op)
                    {
                        tx.objectStore('pendingOperations').delete(op.sequence);
                    }
                });
                record.acknowledgedChangeIds = Array.from(new Set(record.acknowledgedChangeIds.concat(ids)));
                record.status = record.acknowledgedChangeIds.length === record.changeIds.length ? 'acknowledged'
                    : record.protocol === 'score-v2' ? 'completed' : 'partial';
                record.lastOutcome = record.status;
                record.outcomeAt = new Date().toISOString();
                tx.objectStore('requestSnapshots').put(record);
                done(freeze(record));
            }, abort);
        });
    }

    // Explicit, field-scoped resolution. Superseded operations stay archived.
    // An unknown in-flight outcome must be settled by retry before resolution.
    async function resolveField(input, field, action, expectation)
    {
        const c = documentContext(input);
        const expected = expectation === undefined ? undefined : structuredClone(expectation);
        if (!fields.includes(field) || !['rebase', 'discard'].includes(action))
        {
            throw new Error('Explicit field and rebase/discard action required.');
        }
        if (!expected || !Array.isArray(expected.changeIds)
            || expected.changeIds.some(function(id)
            {
                return typeof id !== 'string' || !id;
            }) || new Set(expected.changeIds).size !== expected.changeIds.length
            || !(expected.generation === null || typeof expected.generation === 'string' && expected.generation)
            || !(expected.fieldRevision === null || validRevision(expected.fieldRevision)))
        {
            throw scoreError('invalid-resolution-expectation', 'Resolution requires the exact observed IDs, generation and field revision.');
        }
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const pending = sorted(data.pendingOperations.filter(function(op)
                {
                    return op.documentId === c.documentId && op.field === field;
                }));
                const cache = data.serverCache.find(function(card)
                {
                    return card.documentId === c.documentId;
                });
                const current = resolutionExpectation(cache, pending, field);
                if (JSON.stringify(current.changeIds) !== JSON.stringify(expected.changeIds)
                    || current.generation !== expected.generation || current.fieldRevision !== expected.fieldRevision)
                {
                    throw scoreError('stale-resolution', 'The field changed after the decision was observed; request a new decision.');
                }
                if (data.requestSnapshots.some(function(record)
                {
                    return record.status === 'prepared' && record.changeIds.some(function(id)
                    {
                        return pending.some(function(op) { return op.changeId === id; });
                    });
                }))
                {
                    throw new Error('Resolve uncertain request outcome by retry first.');
                }
                if (action === 'rebase' && (!validRevision(cache?.fieldRevisions?.[field]) || !cache?.generation))
                {
                    throw new Error('Explicit rebase requires confirmed revision and generation.');
                }
                pending.forEach(function(op)
                {
                    tx.objectStore('pendingOperations').delete(op.sequence);
                    tx.objectStore('operationIssues').delete(op.changeId);
                    tx.objectStore('operationReceipts').put(Object.assign({}, c,
                        { changeId: op.changeId, status: action === 'rebase' ? 'superseded' : 'discarded', operation: op }));
                });
                if (action === 'rebase' && pending.length)
                {
                    const latest = pending[pending.length - 1];
                    const op = makeOperation(c, { field: field, operation: latest.operation, value: latest.value }, cache, null);
                    const request = tx.objectStore('pendingOperations').add(op);
                    request.onsuccess = function() { op.sequence = request.result; };
                    done(op);
                }
                else
                {
                    done(null);
                }
            }, abort);
        });
    }

    async function markRequestOutcome(input, requestId, outcome)
    {
        const c = context(input);
        if (!['failed', 'aborted'].includes(outcome))
        {
            throw new Error('Only failed or aborted outcomes are supported.');
        }
        return transact(stores, 'readwrite', function(tx, done, abort)
        {
            load(tx, c, function(data)
            {
                const record = data.requestSnapshots.find(function(item) { return item.requestId === requestId; });
                requireRequest(record, c);
                record.lastFailure = { outcome: outcome, at: new Date().toISOString() };
                if (!['acknowledged', 'completed'].includes(record.status))
                {
                    record.lastOutcome = outcome;
                    record.outcomeAt = record.lastFailure.at;
                }
                tx.objectStore('requestSnapshots').put(record);
                done(freeze(record));
            }, abort);
        });
    }

    async function close()
    {
        if (connection)
        {
            const db = await connection;
            db.close();
            connection = null;
        }
    }

    return Object.freeze(
    {
        databaseName: name, open: open, close: close, appendChanges: appendChanges,
        putServerSnapshot: putServerSnapshot, replaceServerGeneration: replaceServerGeneration,
        inspect: inspect, readScorecard: readScorecard,
        createRequestSnapshot: createRequestSnapshot, getRequestSnapshot: getRequestSnapshot,
        prepareRequestRetry: prepareRequestRetry,
        acknowledgeRequest: acknowledgeRequest, markRequestOutcome: markRequestOutcome, resolveField: resolveField
    });
};

app.scoreSyncStore = app.createScoreSyncStore();
