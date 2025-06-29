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
