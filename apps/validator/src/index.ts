// TODO: connect to Redis Streams (ioredis) and join consumer group
// TODO: consume `submission.received` events
// TODO: load the campaign's JSON Schema from DB
// TODO: validate submission.data against schema using Ajv
// TODO: update submission status to `valid` or `invalid`
// TODO: emit `submission.validated` event

console.log('[validator] service starting…');
