const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.cleanupStaleRooms = functions
  .region('europe-west1')
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    const cutoff = Date.now() - 15 * 60 * 1000; // 15 minutes
    const stale = await db.collection('rooms')
      .where('started', '==', false)
      .where('lastActivity', '<=', new Date(cutoff))
      .get();

    const deletions = [];
    stale.forEach(doc => {
      deletions.push(doc.ref.delete());
    });

    await Promise.all(deletions);
  });

exports.leaveRoom = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    const roomId = req.query.roomId;
    const uid = req.query.uid;
    if (!roomId || !uid) {
      res.status(400).send('roomId and uid required');
      return;
    }

    try {
      const ref = db.collection('rooms').doc(roomId);
      const snap = await ref.get();
      if (!snap.exists) {
        res.status(200).end();
        return;
      }

      const data = snap.data();
      if (data.createdBy === uid && !data.started) {
        await ref.delete();
      } else {
        await ref.update({
          [`players.${uid}`]: admin.firestore.FieldValue.delete(),
          lastActivity: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 1000)
        });
      }

      res.status(200).end();
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  });

// Optional AI mission generator
const fetch = require('node-fetch');

exports.generateMissions = functions
  .region('europe-west1')
  .https.onRequest(async (req, res) => {
    const theme = (req.body && req.body.theme) || req.query.theme;
    if (!theme) {
      res.status(400).send('theme required');
      return;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const fallback = [1,2,3,4,5].map(i => `${theme} mission ${i}`);

    if (!apiKey) {
      res.status(200).json({ missions: fallback });
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            { role: 'system', content: 'You generate short mission descriptions for the board game The Resistance.' },
            { role: 'user', content: `Generate 5 brief mission descriptions set in ${theme}. Return them as a JSON array.` }
          ],
          temperature: 0.7
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      const match = text.match(/\[[\s\S]*\]/);
      const missions = match ? JSON.parse(match[0]) : fallback;
      res.status(200).json({ missions });
    } catch (err) {
      console.error(err);
      res.status(200).json({ missions: fallback });
    }
  });
