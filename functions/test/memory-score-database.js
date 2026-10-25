"use strict";

// Test-only transaction adapter. No Admin SDK, credentials or network.
const assert = require("node:assert/strict");
const DELETE = "__TEST_FIELD_DELETE__";

function merge(target, patch)
{
    for (const [key, value] of Object.entries(patch))
    {
        if (value === DELETE)
        {
            delete target[key];
        }
        else if (value && typeof value === "object" && !Array.isArray(value))
        {
            target[key] = merge(target[key] || {}, value);
        }
        else
        {
            target[key] = value;
        }
    }
    return target;
}

function memoryDatabase()
{
    let records = new Map();
    let tail = Promise.resolve();
    let epoch = 0;
    function snapshot(path)
    {
        const record = records.get(path);
        return { exists: !!record, createTime: record && record.createTime, data: function()
        {
            return structuredClone(record?.data);
        } };
    }
    function write(target, path, data, options, commitTime)
    {
        const previous = target.get(path);
        const creationTime = previous?.createTime || commitTime || { seconds: ++epoch, nanoseconds: 0 };
        const value = merge(options?.merge ? structuredClone(previous?.data || {}) : {}, data);
        target.set(path, { data: value, createTime: creationTime });
    }
    return {
        collection: function(collection)
        {
            return { doc: function(id)
            {
                const path = collection + "/" + id;
                return { path: path, get: async function() { return snapshot(path); },
                    set: async function(data, options) { write(records, path, structuredClone(data), options); },
                    delete: async function() { records.delete(path); } };
            } };
        },
        runTransaction: function(work)
        {
            const task = tail.then(async function()
            {
                const writes = [];
                const result = await work({ get: async function(ref)
                {
                    assert.equal(writes.length, 0, "all reads must precede writes");
                    return snapshot(ref.path);
                }, set: function(ref, data, options)
                {
                    writes.push({ ref: ref, data: structuredClone(data), options: options });
                } });
                const next = structuredClone(records);
                const commitTime = { seconds: ++epoch, nanoseconds: 0 };
                writes.forEach(function(item) { write(next, item.ref.path, item.data, item.options, commitTime); });
                records = next;
                return result;
            });
            tail = task.catch(function() {});
            return task;
        }
    };
}

module.exports = { memoryDatabase: memoryDatabase, fieldValue: { delete: function() { return DELETE; } } };
