const assert = require('node:assert');
const test = require('node:test');
const Module = require('module');

function queryMock(docs) {
  return {
    where: () => queryMock(docs),
    get: async () => ({
      forEach: (cb) => docs.forEach(doc => cb(doc))
    })
  };
}

test('cleanupStaleRooms deletes stale rooms', async () => {
  let deleted = 0;
  const docs = [
    { ref: { delete: () => { deleted++; } } },
    { ref: { delete: () => { deleted++; } } }
  ];

  const adminMock = {
    initializeApp: () => {},
    firestore: () => ({
      collection: () => queryMock(docs)
    })
  };

  const functionsMock = {
    region: () => ({
      pubsub: {
        schedule: () => ({
          onRun: fn => fn
        })
      },
      https: {
        onRequest: fn => fn
      }
    })
  };

  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === 'firebase-admin') return adminMock;
    if (request === 'firebase-functions') return functionsMock;
    return originalLoad(request, parent, isMain);
  };

  const fn = require('../functions/index.js').cleanupStaleRooms;
  Module._load = originalLoad;

  await fn();

  assert.strictEqual(deleted, docs.length);
});
