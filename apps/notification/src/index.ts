// TODO: connect to Redis Streams (ioredis) and join consumer group
// TODO: consume `campaign.reminder.due` events
// TODO: look up recipient channels (email / WhatsApp / SMS)
// TODO: send via Nodemailer (SMTP), WhatsApp stub, SMS stub
// TODO: skip recipients who have already submitted (check submissions table)

console.log('[notification] service starting…');
