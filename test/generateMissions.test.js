const assert = require('node:assert');
const test = require('node:test');
const Module = require('module');

process.env.OPENAI_API_KEY = '';

test('generateMissions falls back when API key missing', async () => {
  let fetchCalled = false;
  const fetchMock = async () => { fetchCalled = true; };

  const adminMock = { initializeApp: () => {}, firestore: () => ({}) };
  const functionsMock = {
    region: () => ({
      https: { onRequest: fn => fn },
      pubsub: { schedule: () => ({ onRun: fn => fn }) }
    })
  };

  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === 'firebase-admin') return adminMock;
    if (request === 'firebase-functions') return functionsMock;
    if (request === 'node-fetch') return fetchMock;
    return originalLoad(request, parent, isMain);
  };

  const fn = require('../functions/index.js').generateMissions;
  Module._load = originalLoad;

  const req = { body: { theme: 'Test' }, query: {} };
  let statusCode;
  let jsonData;
  const res = {
    status(code) { statusCode = code; return this; },
    json(data) { jsonData = data; }
  };

  await fn(req, res);

  assert.strictEqual(statusCode, 200);
  assert.deepStrictEqual(jsonData.missions, [
    'Test mission 1',
    'Test mission 2',
    'Test mission 3',
    'Test mission 4',
    'Test mission 5'
  ]);
  assert.strictEqual(fetchCalled, false);
});

