# Firebase setup

This app uses Firebase Authentication for manager/player login and Firestore for the shared public queue.

## 1. Create the Firebase project

1. Create a Firebase project.
2. Add a Web app in that project.
3. Enable Authentication providers:
   - Email/password
4. Create a Firestore database.

## 2. Fill in `firebase-config.js`

Paste the Firebase Web app config into `firebaseConfig`.

Add manager emails to `managerEmails`. Only these emails can open `index.html` when Firebase is configured.

```js
export const appSettings = {
  queueDocPath: ["pickupQueues", "main"],
  managerEmails: ["manager@example.com"],
};
```

## 3. Firestore rules

Paste the contents of `firestore.rules` into Firestore Rules in the Firebase console.

The current app stores the queue in one shared document at `pickupQueues/main`. These rules require users to be signed in before they can read or write the queue:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /pickupQueues/main {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

Important: because the queue is one document, Firestore rules cannot safely prove that a player only edited their own queue entry. This is fine for testing with trusted players, but before broad public use the database should move player queue entries into per-player documents or use Cloud Functions for join/leave actions.

## Local testing

Do not double-click `index.html` directly. The app uses browser modules and Firebase, so run it from a web server.

From the project root, double-click `Start App.bat`, or run:

```powershell
cd web
python -m http.server 8000 --bind 127.0.0.1
```

Then open `http://localhost:8000/index.html`.
