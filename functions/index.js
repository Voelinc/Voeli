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
// - Skips if the message is marked deleted or has no senderId.
// - Prunes tokens that FCM reports as invalid so they don't pile up.
// - Uses the message's `translated` text for the body when available; falls
//   back to a generic body when only encrypted envelopes are present (this
//   function runs without the message-encryption key by design). Truncated
//   to 140 chars.

const { onValueCreated } = require('firebase-functions/v2/database');
const admin = require('firebase-admin');

admin.initializeApp();

// FCM amplification throttle. Without this, a single user spamming a
// 50-person room can drive Firebase Cloud Messaging costs up linearly with
// participant count. We keep a small per-(sender, room) counter under
// /notifyThrottle and skip the push (NOT the message itself) once the
// sender exceeds NOTIFY_LIMIT pushes inside NOTIFY_WINDOW_MS.
//
// Rules deny direct read/write at /notifyThrottle so only the function
// (running with admin credentials) can touch it.
const NOTIFY_WINDOW_MS = 10_000;
const NOTIFY_LIMIT = 5;

async function shouldThrottleNotification(db, senderId, roomId) {
  const ref = db.ref(`/notifyThrottle/${senderId}/${roomId}`);
  const now = Date.now();
  let throttled = false;
  await ref.transaction((cur) => {
    if (!cur || (now - cur.windowStartMs) > NOTIFY_WINDOW_MS) {
      return { count: 1, windowStartMs: now };
    }
    if (cur.count >= NOTIFY_LIMIT) {
      throttled = true;
      return cur;
    }
    return { count: cur.count + 1, windowStartMs: cur.windowStartMs };
  });
  return throttled;
}

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

    if (await shouldThrottleNotification(db, msg.senderId, roomId)) {
      console.log(`[notify] throttled sender=${msg.senderId} room=${roomId} (>${NOTIFY_LIMIT} in ${NOTIFY_WINDOW_MS}ms)`);
      return null;
    }

    const partsSnap = await db.ref(`/dms/${roomId}/participants`).once('value');
    const parts = partsSnap.val() || {};
    const allRecipients = Object.keys(parts).filter((uid) => uid !== msg.senderId && parts[uid] === true);
    if (!allRecipients.length) return null;

    // Drop recipients who muted this room. Stored at /users/$uid/mutedRooms/$roomId
    // (boolean true). Reading it under admin creds bypasses the rules; the
    // user-facing rule still locks /users/$uid to that user.
    const muteSnaps = await Promise.all(
      allRecipients.map((uid) => db.ref(`/users/${uid}/mutedRooms/${roomId}`).once('value'))
    );
    const recipients = allRecipients.filter((_, i) => muteSnaps[i].val() !== true);
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

    // Prefer the sender's chosen display name (set during signup at the
    // Name screen). Fall back to the email's local part when no display
    // name is set (older accounts), and to a generic label as a last
    // resort. The slice cap keeps a pathological 200-char "name" from
    // blowing past iOS's notification title width.
    let senderName = 'New message';
    try {
      const dnSnap = await db.ref(`/users/${msg.senderId}/displayName`).once('value');
      const dn = dnSnap.val();
      if (typeof dn === 'string' && dn.trim().length) {
        senderName = dn.trim().slice(0, 60);
      } else {
        const sSnap = await db.ref(`/users/${msg.senderId}/email`).once('value');
        const email = sSnap.val();
        if (typeof email === 'string' && email.includes('@')) {
          senderName = email.split('@')[0].slice(0, 60);
        } else if (email != null) {
          console.warn(`[notify] unexpected email type for sender=${msg.senderId}: ${typeof email}`);
        }
      }
    } catch (e) {
      console.warn(`[notify] failed to read sender profile for sender=${msg.senderId}:`, e.message);
    }

    // Body intentionally stays generic. text/original are encrypted envelopes
    // ({v, c} objects) by the time they hit the database, and this function
    // runs without the message-encryption key by design — leaking plaintext
    // through the notification body would defeat the envelope. Signal and
    // iMessage handle E2E pushes the same way: "{Name} sent a message".
    const body = 'Sent you a message';
    const tokens = tokenEntries.map((e) => e.token);

    let res;
    try {
      res = await admin.messaging().sendEachForMulticast({
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
    } catch (e) {
      // Network blip, auth failure, or malformed payload. Don't crash the
      // function (which would skip token cleanup AND show up as an error
      // in Firebase's monitoring with no useful breadcrumb).
      console.error(`[notify] sendEachForMulticast failed for room=${roomId}:`, e.message);
      return null;
    }

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
