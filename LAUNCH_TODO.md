# Voeli launch TODO

Console-only setup steps remaining before public launch. All code is in place; these are billing / key-generation / deploy actions you have to do yourself.

## 1. Deploy the new Firebase rules + Cloud Function

```sh
firebase deploy --only database          # tightened DM/users/invites rules
cd functions && npm install && cd ..
firebase deploy --only functions         # FCM-on-message-write trigger
```

After deploying:
- Sign in as a test user, try `firebaseDb.ref('users').once('value')` from devtools — should be denied.
- Existing flows (DMs, friend requests, contacts) should still work.

## 2. Upgrade Firebase to the Blaze plan (REQUIRED for two reasons)

The free Spark plan caps Realtime Database at **100 simultaneous connections** AND blocks Cloud Functions deployment entirely. Blaze is pay-as-you-go and ~$5/month at your scale.

In Firebase console: **Settings → Usage and billing → Modify plan → Blaze**. Set a budget alert at $20/month while you're there.

## 3. Generate the FCM VAPID key

In Firebase console: **Project Settings → Cloud Messaging → Web configuration → Generate key pair.** Copy the resulting "Public key".

Open [frontend/index.html](frontend/index.html), find:

```js
const FCM_VAPID_KEY = '';
```

Paste the key inside the quotes. Push notifications stay silently disabled until this is set, so it's safe to ship without it but you'll want it for launch.

## 4. Bootstrap yourself as the first admin

The new `reports` rule only lets admins read incoming reports. From Firebase console → **Realtime Database → Data**, add a child:

```
admins/<your-firebase-auth-uid>: true
```

To find your UID, log in to Voeli, open browser devtools, run `firebase.auth().currentUser.uid`.

After that, view incoming reports at `/reports.json` in the console.

## 5. (Optional but recommended) Add a 192×192 app icon

Drop `icon-192.png` (any 192×192 transparent PNG of your logo) into `frontend/`. The Service Worker references it for push notification icons; without it the OS falls back to a generic browser icon.

## What's already done in this branch

**Security**
- Firebase rules tightened: `users` enumeration blocked, `registeredEmails` removed, `invites` locked to auth-only, `dms.participants` locked to participants, `reports` + `admins` paths added
- `emailExists()` enumerative read removed from frontend
- Content Security Policy meta tag added (blocks data exfiltration via XSS)
- All `console.log('[TAG]', …)` debug logs stripped from `backend/src/openai.ts` and `backend/src/slang-fix.ts`

**Features**
- "Report message" item in the bubble context menu (receiver-only), writes `/reports/$id`
- "Export my data" button in Settings — downloads JSON of profile, contacts, all DM messages
- "Delete account" button in Settings — scrubs sent messages, removes self from rooms, deletes /users/$uid, deletes Firebase Auth user
- FCM push notifications: Service Worker at [frontend/firebase-messaging-sw.js](frontend/firebase-messaging-sw.js), token registration on sign-in, token cleanup on sign-out, foreground messages shown via toast, background via OS notification
- Cloud Function in [functions/index.js](functions/index.js): triggers on `dms/{roomId}/messages/{msgId}` writes, sends FCM to all recipient devices, prunes invalid tokens

**Cleanup**
- 9 dead files deleted (test scripts, examples, stray docs, app.yaml, empty functions dir)

**Docs**
- Privacy policy: added abuse-reports data point, no-E2E-encryption disclosure (EN + VI), updated date
- `firebase.json` extended with `database` + `functions` config so `firebase deploy` covers everything

**Verified already-done (audit agent had missed these)**
- Password reset is wired ([index.html:4672](frontend/index.html:4672))
- Turnstile is on signup form (button disabled until token issued)
- XSS audit: `esc()` is consistently used; CSP added as belt-and-braces

## Verification checklist before going live

- [ ] `firebase deploy --only database`
- [ ] Upgrade to Blaze
- [ ] `cd functions && npm install && firebase deploy --only functions`
- [ ] Generate VAPID key, paste into `FCM_VAPID_KEY` in index.html, redeploy hosting
- [ ] Bootstrap admin UID in console
- [ ] Drop in `frontend/icon-192.png`
- [ ] Push test: open Voeli on phone, switch apps, send from desktop — OS notification fires
- [ ] Report test: send message from user A, receive as user B, tap Report, confirm row appears in `/reports`
- [ ] Delete-account test: create throwaway account, send a few messages, delete, confirm Auth user gone and messages flagged deleted in DM
- [ ] Export test: tap Export, JSON file downloads with profile/contacts/messages
- [ ] Rules test: from a freshly-signed-in second account, attempt `firebaseDb.ref('users').once('value')` — should get permission denied
- [ ] XSS test: send `<img src=x onerror=alert(1)>` as a message, open as recipient — renders as literal text, no alert
- [ ] Privacy policy: read end-to-end, click every link
- [ ] `wrangler tail` no longer shows `[DEBUG]` / `[PRONOUN OVERRIDE]` / etc lines
