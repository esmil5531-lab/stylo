import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Data handed from one journey to the next (an order placed → prepared → assigned → delivered). */
const STATE = join(__dirname, '.state.json');
const TOKENS = join(__dirname, '.tokens.json');
/** The back-office session of the Stylo staff member, reused by the custody journey. */
export const STAFF_SESSION = join(__dirname, '.staff-session.json');

export interface JourneyState {
  orderId?: string;
  orderNumber?: number;
  orderTotal?: number;
}

export function readState(): JourneyState {
  return existsSync(STATE) ? (JSON.parse(readFileSync(STATE, 'utf8')) as JourneyState) : {};
}

export function saveState(patch: JourneyState) {
  writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

export function tokens(): { sara: string; admin: string } {
  return JSON.parse(readFileSync(TOKENS, 'utf8'));
}
