import { config } from 'dotenv';
import { resolve } from 'path';

// Runs once in the main vitest process before any fork workers start.
// process.env mutations here are inherited by all fork workers.
export default function setup(): void {
  config({ path: resolve(__dirname, '../../../../.env') });
}
