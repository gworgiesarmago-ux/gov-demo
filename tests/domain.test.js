import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFees, validateRegistration, validateApplication, validateUpload, sniffUpload, makeCalendar, upcomingReminders } from '../src/domain.js';
import * as domain from '../src/domain.js';

const registration = {
  firstName: 'Maria', lastName: 'Santos', email: 'maria@example.com',
  mobileNumber: '9171234567', password: 'Secure123', confirmPassword: 'Secure123',
  entityType: 'Sole Proprietorship', lguLocation: 'Quezon City', termsConsent: true, perjuryCert: true,
};

test('fees accurately distinguish delivery and pickup without accepting unsupported methods', () => {
  assert.deepEqual(calculateFees('express'), { base: 300, delivery: 150, total: 450 });
  assert.deepEqual(calculateFees('pickup'), { base: 300, delivery: 0, total: 300 });
  assert.throws(() => calculateFees('free'), /delivery/i);
  assert.throws(() => calculateFees(), /delivery/i);
});

test('complete registration validates without changing user input', () => {
  const data = Object.freeze({ ...registration });
  assert.deepEqual(validateRegistration(data), {});
  assert.deepEqual(validateRegistration({ ...data, firstName: '  Maria  ', email: 'maria+permit@example.com' }), {});
});

test('empty or malformed registration reports each required field', () => {
  const required = ['firstName', 'lastName', 'email', 'mobileNumber', 'password', 'confirmPassword', 'entityType', 'lguLocation', 'termsConsent', 'perjuryCert'];
  assert.deepEqual(Object.keys(validateRegistration({})).sort(), required.sort());
  assert.deepEqual(Object.keys(validateRegistration(null)).sort(), required.sort());
  const errors = validateRegistration({ ...registration, firstName: ' ', lastName: 42, email: 'invalid', mobileNumber: '09171234567', password: 'abcdefgh', confirmPassword: 'different', termsConsent: 'yes', perjuryCert: false });
  for (const field of ['firstName', 'lastName', 'email', 'mobileNumber', 'password', 'confirmPassword', 'termsConsent', 'perjuryCert']) assert.ok(errors[field], field);
});

test('registration requires local ten digit mobile and sufficiently strong password', () => {
  for (const mobileNumber of ['8171234567', '917123456', '91712345678', '+639171234567', '917123456x']) assert.ok(validateRegistration({ ...registration, mobileNumber }).mobileNumber);
  for (const password of ['abc123', '12345678', 'abcdefgh']) assert.ok(validateRegistration({ ...registration, password }).password);
});

test('application accepts zero employees, upper employee boundary, and formatted positive capital', () => {
  assert.deepEqual(validateApplication({ employees: 0, capitalization: 1, delivery: 'pickup' }), {});
  assert.deepEqual(validateApplication({ employees: '100000', capitalization: '1,234,567.89', delivery: 'express' }), {});
  assert.deepEqual(validateApplication({ employees: '2', capitalization: '1000.50', delivery: 'pickup' }), {});
});

test('application rejects malformed, missing, negative, infinite, and fractional values', () => {
  assert.deepEqual(Object.keys(validateApplication({})).sort(), ['employees', 'capitalization', 'delivery'].sort());
  assert.equal(Object.keys(validateApplication(null)).length, 3);
  for (const employees of ['', ' ', -1, 1.5, 100001, Infinity, '2 people', true, null]) assert.ok(validateApplication({ employees, capitalization: 100, delivery: 'pickup' }).employees, String(employees));
  for (const capitalization of ['', ' ', 0, -1, Infinity, '1,00', '10,000xyz', 'NaN', null, true]) assert.ok(validateApplication({ employees: 1, capitalization, delivery: 'pickup' }).capitalization, String(capitalization));
  assert.ok(validateApplication({ employees: 1, capitalization: 100, delivery: 'post' }).delivery);
});

test('upload accepts PDF and image formats through the exact ten megabyte boundary', () => {
  for (const type of ['application/pdf', 'image/jpeg', 'image/png']) assert.equal(validateUpload({ type, size: 10 * 1024 * 1024 }), null);
});

test('upload metadata rejects missing files, empty and oversized uploads', () => {
  for (const file of [null, {}, { type: 'application/pdf', size: 0 }, { type: 'image/png', size: -1 }, { type: 'image/jpeg', size: 10485761 }, { type: 'application/pdf', size: Infinity }, { type: 'image/png', size: '10' }]) assert.equal(typeof validateUpload(file), 'string');
  assert.equal(validateUpload({type: '', size: 100}), null);
});

test('upload signatures identify supported files even when MIME metadata is absent or incorrect', async () => {
  const fixtures = [
    ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ];
  for (const [type, bytes] of fixtures) {
    for (const claimedType of ['', 'text/html', 'application/pdf']) {
      const blob = new Blob([new Uint8Array(bytes)], {type: claimedType});
      assert.deepEqual(await sniffUpload(blob), {type, error: null});
    }
  }
});

test('upload signatures reject disguised content, truncated headers, unreadable and oversized files', async () => {
  const invalid = [
    new Blob(['<html>not a PDF</html>'], {type: 'application/pdf'}),
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {type: 'image/png'}),
    new Blob([new Uint8Array([0xff, 0xd8])], {type: 'image/jpeg'}),
    new Blob([]), null, {size: 10}, {size: 10485761},
    {size: 10, slice: () => ({arrayBuffer: async () => { throw new Error('unreadable'); }})},
  ];
  for (const file of invalid) {
    const result = await sniffUpload(file);
    assert.equal(result.type, null);
    assert.equal(typeof result.error, 'string');
  }
});

test('sample reminders are strictly future dates and roll across months and years', () => {
  assert.deepEqual(upcomingReminders(new Date('2026-10-29T01:00:00Z')).map(event => event.date), ['2027-01-20', '2027-01-25', '2026-11-15']);
  assert.deepEqual(upcomingReminders(new Date('2026-12-31T10:00:00Z')).map(event => event.date), ['2027-01-20', '2027-01-25', '2027-01-15']);
  assert.deepEqual(upcomingReminders(new Date('2027-01-20T04:00:00Z')).map(event => event.date), ['2028-01-20', '2027-01-25', '2027-02-15']);
  assert.equal(upcomingReminders(new Date('2028-02-29T01:00:00Z'))[2].date, '2028-03-15');
  assert.equal(upcomingReminders().length, 3);
  assert.throws(() => upcomingReminders(new Date('invalid')), /time/i);
});

test('sample reminders use the Singapore day boundary independently of the host timezone', () => {
  assert.equal(upcomingReminders(new Date('2026-10-24T15:59:59Z'))[1].date, '2026-10-25');
  assert.equal(upcomingReminders(new Date('2026-10-24T16:00:00Z'))[1].date, '2027-01-25');
  assert.equal(upcomingReminders(new Date('2026-10-14T16:00:00Z'))[2].date, '2026-11-15');
});

test('calendar stamps the generation time and includes a display reminder for each event', () => {
  const now = new Date('2026-10-29T08:09:10.123Z');
  const output = makeCalendar(upcomingReminders(now), now);
  assert.equal(output.match(/DTSTAMP:20261029T080910Z/g)?.length, 3);
  assert.equal(output.match(/BEGIN:VALARM/g)?.length, 3);
  assert.equal(output.match(/ACTION:DISPLAY/g)?.length, 3);
  assert.equal(output.match(/TRIGGER:PT9H/g)?.length, 3);
  assert.throws(() => makeCalendar([], new Date('invalid')), /time/i);
});

test('calendar is an all-day ICS download with deterministic IDs and escaped text', () => {
  const output = makeCalendar([{ title: 'Permit, renewal; office\\main\nBEGIN:VEVENT', date: '2026-01-31' }]);
  assert.match(output, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(output, /DTSTART;VALUE=DATE:20260131\r\nDTEND;VALUE=DATE:20260201/);
  assert.ok(output.includes('SUMMARY:Permit\\, renewal\\; office\\\\main\\nBEGIN:VEVENT'));
  assert.equal(output.match(/\r\nBEGIN:VEVENT\r\n/g).length, 1);
  assert.ok(output.endsWith('END:VCALENDAR\r\n'));
  assert.equal(makeCalendar([]).includes('BEGIN:VEVENT'), false);
  assert.equal(makeCalendar([{ title: 'Leap', date: '2028-02-29' }]).includes('DTEND;VALUE=DATE:20280301'), true);
});

test('calendar rejects invalid dates and event shapes instead of producing corrupt downloads', () => {
  assert.throws(() => makeCalendar(null), /events/i);
  for (const event of [null, {}, { title: '', date: '2026-01-01' }, { title: 'x', date: '2026-02-30' }, { title: 'x', date: '2026-13-01' }, { title: 'x', date: '2026-1-01' }, { title: 'x', date: '2026-01-01\r\nEND:VCALENDAR' }]) assert.throws(() => makeCalendar([event]));
});

test('sample documents carry the saved profile and vary their content by document type', () => {
  const profile = Object.freeze({firstName: 'Ana', lastName: 'Reyes', businessName: 'Ana Coffee', address: 'A long saved address', entityType: 'Sole Proprietorship', lguLocation: 'Cebu City'});
  const dti = domain.sampleDocument('DTI Certificate of Registration', profile, {reference: 'DEMO-123'});
  const lease = domain.sampleDocument('Commercial Lease Contract', profile);
  const cedula = domain.sampleDocument('Community Tax Certificate', profile);
  const mayor = domain.sampleDocument("Mayor's Permit", profile);
  const bir = domain.sampleDocument('BIR Certificate of Registration', profile);
  assert.equal(dti.applicant, 'Ana Reyes');
  assert.equal(dti.business, 'Ana Coffee');
  assert.equal(dti.address, 'A long saved address');
  assert.equal(dti.reference, 'DEMO-123');
  assert.match(dti.details.join(' '), /business name/i);
  assert.match(lease.details.join(' '), /tenancy|lease/i);
  assert.match(cedula.details.join(' '), /tax/i);
  assert.match(mayor.details.join(' '), /permit/i);
  assert.match(bir.details.join(' '), /taxpayer/i);
  assert.equal(new Set([dti, lease, cedula, mayor, bir].map(item => item.details.join(' '))).size, 5);
  assert.match(domain.sampleDocument(undefined, null, null).disclaimer, /not valid for official use/i);
  assert.match(domain.sampleDocument('Other local record').details.join(' '), /sample/i);
});

test('export filenames are recognizable, safe and distinct for document types', () => {
  assert.equal(domain.documentFilename('Commercial Lease Contract'), 'SugboStart-sample-commercial-lease-contract.pdf');
  assert.equal(domain.documentFilename('DTI Certificate of Registration'), 'SugboStart-sample-dti-certificate-of-registration.pdf');
  assert.equal(domain.documentFilename('../../evil\\path?.pdf'), 'SugboStart-sample-evil-path-pdf.pdf');
  assert.equal(domain.documentFilename(''), 'SugboStart-sample-document.pdf');
  assert.equal(domain.documentFilename(null), 'SugboStart-sample-document.pdf');
  assert.ok(domain.documentFilename('a'.repeat(500)).length < 140);
});

test('sample credential links preserve the hosting subdirectory and encode the record ID', () => {
  assert.equal(domain.sampleLookupUrl('https://example.test/demo/vault.html', 'BN + /?&'), 'https://example.test/demo/welcome.html?permit=BN+%2B+%2F%3F%26');
  assert.equal(domain.sampleLookupUrl('https://example.test/vault.html', 'BN-1'), 'https://example.test/welcome.html?permit=BN-1');
});
