// Cloud Function: send a push notification when a new DM message arrives.
//
// Trigger:  RTDB write at /dms/{roomId}/messages/{msgId}
// Action:   look up the recipient's FCM tokens (the participants minus the
//           sender), send a notification to each via Firebase Cloud Messaging.
//
// Deploy:
//   cd functions && npm install
//   firebase deploy --only functions
//
// Notes:
// - Uses the firebase-functions v2 API (v1 is being deprecated).
// - Skips if the message is marked deleted, queued, or has no senderId.
// - Prunes tokens that FCM reports as invalid so they don't pile up.
// - Uses the message's `original` text for the body when available, falling
//   back to `text`/`translated`. Truncated to 140 chars.

const { onValueCreated } = require('firebase-functions/v2/database');
const admin = require('firebase-admin');

admin.initializeApp();

exports.notifyOnDmMessage = onValueCreated(
  {
    ref: '/dms/{roomId}/messages/{msgId}',
    region: 'us-central1'
  },
  async (event) => {
    const msg = event.data.val() || {};
    const { roomId, msgId } = event.params;
    if (!msg.senderId || msg.deleted) return null;

    const db = admin.database();
    const partsSnap = await db.ref(`/dms/${roomId}/participants`).once('value');
    const parts = partsSnap.val() || {};
    const recipients = Object.keys(parts).filter((uid) => uid !== msg.senderId && parts[uid] === true);
    if (!recipients.length) return null;

    const tokenSnaps = await Promise.all(
      recipients.map((uid) => db.ref(`/users/${uid}/fcmTokens`).once('value'))
    );
    const tokenEntries = []; // [{ uid, tokenKey, token }]
    tokenSnaps.forEach((s, i) => {
      const map = s.val() || {};
      for (const k of Object.keys(map)) {
        if (map[k] && map[k].token) tokenEntries.push({ uid: recipients[i], tokenKey: k, token: map[k].token });
      }
    });
    if (!tokenEntries.length) return null;

    let senderName = 'New message';
    try {
      const sSnap = await db.ref(`/users/${msg.senderId}/email`).once('value');
      const email = sSnap.val();
      if (email) senderName = String(email).split('@')[0];
    } catch (_) {}

    const body = String(msg.original || msg.text || msg.translated || '').slice(0, 140);
    const tokens = tokenEntries.map((e) => e.token);

    const res = await admin.messaging().sendEachForMulticast({
      notification: { title: senderName, body },
      data: {
        roomId,
        msgId,
        title: senderName,
        body,
        url: '/'
      },
      tokens
    });

    const cleanups = [];
    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          const e = tokenEntries[idx];
          cleanups.push(db.ref(`/users/${e.uid}/fcmTokens/${e.tokenKey}`).remove().catch(() => {}));
        }
      }
    });
    if (cleanups.length) await Promise.all(cleanups);
    return null;
  }
);
