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
