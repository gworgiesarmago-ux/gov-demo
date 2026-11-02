const DELIVERY_METHODS = ['express', 'pickup'];
const text = (value) => typeof value === 'string' ? value.trim() : '';
const record = (value) => value && typeof value === 'object' ? value : {};

export function calculateFees(delivery) {
  if (!DELIVERY_METHODS.includes(delivery)) throw new TypeError('Choose a valid delivery method.');
  const deliveryFee = delivery === 'express' ? 150 : 0;
  return { base: 300, delivery: deliveryFee, total: 300 + deliveryFee };
}

export function validateRegistration(value) {
  const data = record(value);
  const checks = {
    firstName: [Boolean(text(data.firstName)), 'Enter your first name.'],
    lastName: [Boolean(text(data.lastName)), 'Enter your last name.'],
    email: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(data.email)), 'Enter a valid email address.'],
    mobileNumber: [/^9\d{9}$/.test(text(data.mobileNumber)), 'Enter 10 digits starting with 9, without +63.'],
    password: [typeof data.password === 'string' && data.password.length >= 8 && /[a-z]/i.test(data.password) && /\d/.test(data.password), 'Use at least 8 characters, including a letter and a number.'],
    confirmPassword: [Boolean(data.confirmPassword) && data.confirmPassword === data.password, 'Passwords must match.'],
    entityType: [Boolean(text(data.entityType)), 'Select your entity type.'],
    lguLocation: [Boolean(text(data.lguLocation)), 'Select your LGU location.'],
    termsConsent: [data.termsConsent === true, 'Accept the terms and privacy policy to continue.'],
    perjuryCert: [data.perjuryCert === true, 'Certify that your information is accurate.'],
  };
  return Object.fromEntries(Object.entries(checks).filter(([, [valid]]) => !valid).map(([field, [, message]]) => [field, message]));
}

function numericValue(value, grouped = false) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || !value.trim()) return NaN;
  const pattern = grouped ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^\d+$/;
  return pattern.test(value.trim()) ? Number(value.trim().replaceAll(',', '')) : NaN;
}

export function validateApplication(value) {
  const data = record(value);
  const employees = numericValue(data.employees);
  const capital = numericValue(data.capitalization, true);
  return {
    ...(!Number.isInteger(employees) || employees < 0 || employees > 100000 ? { employees: 'Enter a whole number from 0 to 100,000.' } : {}),
    ...(!Number.isFinite(capital) || capital <= 0 ? { capitalization: 'Enter a valid capitalization greater than zero.' } : {}),
    ...(!DELIVERY_METHODS.includes(data.delivery) ? { delivery: 'Select express delivery or pickup.' } : {}),
  };
}

export function validateUpload(file) {
  if (!file) return 'Select a document to upload.';
  if (typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size <= 0) return 'The file is empty or unreadable.';
  if (file.size > 10 * 1024 * 1024) return 'The file must be 10 MB or smaller.';
  return null;
}

export async function sniffUpload(file) {
  const error = validateUpload(file);
  if (error) return {type: null, error};
  try {
    const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
    const signatures = [
      ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
      ['image/jpeg', [0xff, 0xd8, 0xff]],
      ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ];
    const found = signatures.find(([, signature]) => signature.every((byte, index) => bytes[index] === byte));
    return found ? {type: found[0], error: null} : {type: null, error: 'The file content must be a PDF, JPEG, or PNG.'};
  } catch {
    return {type: null, error: 'The file could not be read. Choose it again.'};
  }
}

function validTime(now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Choose a valid generation time.');
  return now;
}

export function upcomingReminders(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(validTime(now));
  const fields = Object.fromEntries(parts.map(({type, value}) => [type, value]));
  const today = `${fields.year}-${fields.month}-${fields.day}`;
  const year = Number(fields.year);
  const month = Number(fields.month) - 1;
  const date = (yearValue, monthValue, day) => new Date(Date.UTC(yearValue, monthValue, day)).toISOString().slice(0, 10);
  const renewal = date(year, 0, 20);
  const contribution = date(year, month, 15);
  const quarterly = [0, 3, 6, 9, 12].map(monthValue => date(year, monthValue, 25)).find(value => value > today);
  return [
    {title: 'Sample: Business permit renewal', date: renewal > today ? renewal : date(year + 1, 0, 20)},
    {title: 'Sample: BIR quarterly filing reminder', date: quarterly},
    {title: 'Sample: Employer contributions reminder', date: contribution > today ? contribution : date(year, month + 1, 15)},
  ];
}

const escapeCalendarText = (value) => value.replaceAll('\\', '\\\\').replace(/\r\n|\r|\n/g, '\\n').replaceAll(';', '\\;').replaceAll(',', '\\,');
const calendarDate = (date) => date.toISOString().slice(0, 10).replaceAll('-', '');

function calendarEvent(event, index, stamp) {
  if (!event || !text(event.title) || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(event.date)) throw new TypeError('Every event needs a title and a valid YYYY-MM-DD date.');
  const start = new Date(`${event.date}T00:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== event.date) throw new TypeError('Event date is invalid.');
  const end = new Date(start.getTime() + 86400000);
  return [
    'BEGIN:VEVENT',
    `UID:${calendarDate(start)}-${index}@gov-services.local`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${calendarDate(start)}`,
    `DTEND;VALUE=DATE:${calendarDate(end)}`,
    `SUMMARY:${escapeCalendarText(event.title)}`,
    'DESCRIPTION:Sample planning reminder only. Confirm official due dates with the relevant agency.',
    'BEGIN:VALARM',
    'TRIGGER:PT9H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeCalendarText(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

export function makeCalendar(events, now = new Date()) {
  if (!Array.isArray(events)) throw new TypeError('Calendar events must be an array.');
  const stamp = validTime(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SugboStart Demo//Sample Planning Calendar//EN', 'CALSCALE:GREGORIAN', ...events.flatMap((event, index) => calendarEvent(event, index, stamp)), 'END:VCALENDAR', ''].join('\r\n');
}

export function documentFilename(title) {
  const slug = text(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'document';
  return `SugboStart-sample-${slug}.pdf`;
}

export function sampleLookupUrl(base, id) {
  const url = new URL('welcome.html', base);
  url.searchParams.set('permit', String(id));
  return url.href;
}

export function sampleDocument(title = 'DTI Certificate of Registration', profile = {}, submission = {}) {
  const person = record(profile);
  const submitted = record(submission);
  const documentTitle = text(title) || 'Sample document';
  const templates = [
    [/lease/i, ['Lease planning summary', 'This sample lists the proposed business premises for tenancy planning. No landlord signature, tenancy agreement, term, rent, or right to occupy is established.']],
    [/cedula|community tax/i, ['Community tax planning summary', 'This sample summarizes applicant details for a possible community tax document. It is not a tax assessment, receipt, payment, or issued certificate.']],
    [/mayor|business permit|bplo/i, ['Business permit planning summary', 'This sample describes a planned business permit application. Operating permission, inspections, clearances, and approval have not been granted.']],
    [/bir|taxpayer/i, ['Taxpayer registration planning summary', 'This sample summarizes information for tax registration planning. No taxpayer number, tax type, registration, or filing status has been assigned or checked.']],
    [/dti|business name/i, ['Business name planning summary', 'This sample summarizes a proposed business name. No name availability check, registry entry, or business registration has been completed.']],
  ];
  const details = templates.find(([pattern]) => pattern.test(documentTitle))?.[1] || ['Local sample record', 'This sample records the saved applicant details for demonstration only. It does not confirm any agency record or approval.'];
  return {
    title: documentTitle,
    applicant: [text(person.firstName), text(person.middleName), text(person.lastName)].filter(Boolean).join(' ') || 'Demo applicant',
    business: text(person.businessName) || 'Your demo business',
    address: text(person.address) || 'Not provided',
    entityType: text(person.entityType) || 'Not provided',
    location: text(person.lguLocation) || 'Not provided',
    reference: text(submitted.reference) || 'No application submitted',
    disclaimer: 'SAMPLE DOCUMENT - NOT VALID FOR OFFICIAL USE',
    details: [...details],
  };
}
