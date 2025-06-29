# the-resistance-webapp
Web game, based on The Resistance - social deduction

## Maintenance

The `functions` directory contains a scheduled Cloud Function that removes
stale lobbies. It deletes any room that hasn't started and has seen no
`lastActivity` updates for more than 15 minutes.
