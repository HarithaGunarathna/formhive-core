// TODO: connect to Redis Streams (ioredis)
// TODO: on startup, load active campaigns from DB and schedule cron jobs (node-cron)
// TODO: each cron fires a `campaign.reminder.due` event on the Redis Stream
// TODO: when a campaign deadline passes, emit a `campaign.closed` event

console.log('[scheduler] service starting…');
