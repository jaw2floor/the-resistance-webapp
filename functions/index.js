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
