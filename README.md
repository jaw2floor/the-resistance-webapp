# the-resistance-webapp
Web game, based on The Resistance - social deduction

## Maintenance

The `functions` directory contains a scheduled Cloud Function that removes
stale lobbies. It deletes any room that hasn't started and has seen no
`lastActivity` updates for more than 15 minutes.

## AI-generated mission themes

Set an `OPENAI_API_KEY` environment variable for the Cloud Functions
deployment to enable automatic mission generation based on a lobby theme.
If the key is missing or the API call fails, placeholder missions are used
so the game can still start.

## Firebase configuration

Client pages use environment variables for their Firebase setup. Copy
`.env.example` to `.env` and fill in your Firebase project details:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
```

Run `npm run build` to inject these values into
`public/js/firebase-init.js` before serving or deploying. The `.env` file is
ignored by Git as listed in `.gitignore`.
