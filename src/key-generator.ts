/**
 * Offline reproduction of the KRS search frontend's request-header encoder.
 *
 * The algorithm was reverse-engineered from the public search frontend JS
 * bundle (`main.107201e5e6b95da7.js`) and verified live against the endpoint
 * on 2026-08-22.
 *
 * The search endpoint's payload stores KRS at `body.podmiot.krs`, while the
 * frontend interceptor only checks `body.krs`. Its exact embedded value for
 * that request is therefore the default '0000000000'.
 *
 * This module performs no network requests.
 */

const KRS_POSITIONS = [193, 8, 327, 501, 112, 74, 409, 226, 16, 306];
const TIMESTAMP_POSITIONS = [492, 141, 364, 78, 259, 12, 430, 384, 97, 503, 67, 35, 471, 218];
const CHECKSUM_POSITIONS = [24, 46, 174, 345];
const SHIFT_MARKER_POSITION = 11;
const TOKEN_LENGTH = 512;

function formatUtcTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    String(date.getUTCFullYear()) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

function shiftRightInPlace(digits: string[], position: number): void {
  for (let index = digits.length - 1; index > position; index -= 1) {
    digits[index] = digits[index - 1];
  }
  digits[position] = '0';
}

function circularRightInPlace(digits: string[], amount: number): void {
  const original = [...digits];
  for (let index = 0; index < digits.length; index += 1) {
    digits[(index + amount) % digits.length] = original[index];
  }
}

export interface KeyOptions {
  krs?: string;
  timestamp?: Date;
  random?: () => number;
}

export function generateKrsApiKey({
  krs = '0000000000',
  timestamp = new Date(),
  random = Math.random,
}: KeyOptions = {}): string {
  const normalizedKrs = String(krs).padStart(10, '0');
  if (!/^\d{10}$/.test(normalizedKrs)) {
    throw new Error('KRS must contain at most 10 decimal digits.');
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Timestamp must be a valid Date or date string.');
  }

  const timestampDigits = formatUtcTimestamp(date);
  const digits = Array.from(
    { length: TOKEN_LENGTH },
    () => String(Math.floor(10 * random())),
  );

  for (let index = TOKEN_LENGTH - 4; index < TOKEN_LENGTH; index += 1) {
    digits[index] = '0';
  }

  KRS_POSITIONS.forEach((position: number, index: number) => {
    digits[position] = normalizedKrs[index];
  });
  TIMESTAMP_POSITIONS.forEach((position: number, index: number) => {
    digits[position] = timestampDigits[index];
  });

  const shift = Math.floor(random() * 9) + 1;
  digits[SHIFT_MARKER_POSITION] = String(shift);

  for (const position of CHECKSUM_POSITIONS) {
    shiftRightInPlace(digits, position);
    digits[position] = '0';
  }

  const checksum = String(
    digits.reduce((sum: number, digit: string) => sum + Number(digit), 0),
  ).padStart(4, '0');
  CHECKSUM_POSITIONS.forEach((position: number, index: number) => {
    digits[position] = checksum[index];
  });

  circularRightInPlace(digits, shift);
  return digits.join('');
}
