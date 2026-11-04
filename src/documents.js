import {el, button, modal, toast, download, read, withBusy} from './ui.js';
import {makeCalendar, upcomingReminders, documentFilename, sampleLookupUrl} from './domain.js';
import {files} from './uploads.js';

export {upcomingReminders} from './domain.js';

const SAMPLE_TITLES = Object.freeze([
  'DTI Certificate of Registration',
  "Mayor's Permit (BPLO)",
  'BIR Certificate of Registration',
  'Commercial Lease Contract',
  'Community Tax Certificate (Cedula)',
]);

export async function pdfBlob() {
  const {jsPDF} = await import('jspdf');
  // Generated documents are intentionally blank placeholders for now.
  return new jsPDF().output('blob');
}

export function previewDocument(title = 'DTI Certificate of Registration') {
  const card = el('div', undefined, 'blank-document');
  card.setAttribute('role', 'img');
  card.setAttribute('aria-label', 'Blank document preview');
  const action = button('Download blank PDF', event => withBusy(event, 'Preparing PDF…', async () => {
    try {
      download(await pdfBlob(), documentFilename(title));
      toast('Blank PDF downloaded.');
    } catch { toast('The document could not be generated. Please try again.'); }
  }));
  modal(title, [el('p', 'This document is blank for now.'), card, action]);
}

export async function showQr(id) {
  const image = el('img');
  image.alt = 'QR code for sample record ' + id;
  image.style.cssText = 'width:220px;margin:0 auto';
  image.hidden = true;
  const status = el('p', 'Generating sample QR code…');
  status.setAttribute('role', 'status');
  modal('Sample credential QR', [el('p', 'This QR opens the demo record lookup. It is not a government verification.'), status, image, el('p', id)]);
  try {
    const QRCode = await import('qrcode');
    image.src = await QRCode.toDataURL(sampleLookupUrl(location.href, id), {width: 260, margin: 2});
    image.hidden = false;
    status.remove();
  } catch {
    status.textContent = 'The sample QR code is unavailable. Close this dialog and try again.';
    toast('Unable to generate the QR code.');
  }
}

export function calendar() {
  try {
    const now = new Date();
    download(new Blob([makeCalendar(upcomingReminders(now), now)], {type: 'text/calendar;charset=utf-8'}), 'SugboStart-sample-deadlines.ics');
    toast('Sample calendar downloaded. Import it into your calendar and confirm official due dates separately.');
  } catch { toast('The calendar could not be generated. Please try again.'); }
}

function attachmentName(file, index) {
  const safeName = String(file.name || 'attachment').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/^\.+|\.+$/g, '').slice(0, 150) || 'attachment';
  return `attachments/${String(index + 1).padStart(2, '0')}-${safeName}`;
}

export async function exportPacket(trigger) {
  return withBusy(trigger, 'Preparing ZIP…', async () => {
    try {
      const [{default: JSZip}, attachments] = await Promise.all([import('jszip'), files()]);
      const zip = new JSZip();
      for (const title of SAMPLE_TITLES) zip.file('samples/' + documentFilename(title), await pdfBlob());
      for (const [index, file] of attachments.entries()) {
        if (!(file.blob instanceof Blob) || !file.blob.size) throw new Error('An attachment could not be read.');
        zip.file(attachmentName(file, index), await file.blob.arrayBuffer());
      }
      zip.file('README.txt', [
        'SugboStart local demonstration packet',
        'SAMPLE RECORDS ONLY - NOT VALID FOR OFFICIAL USE.',
        'The samples/ folder contains five blank, single-page PDF placeholders for now. No certificate, contract, permit, or tax record has been issued or verified.',
        `The attachments/ folder contains ${attachments.length} original file(s) saved by you in this browser. These files have not been verified or sent to any agency.`,
        'Calendar dates are sample planning reminders only. Confirm official due dates separately.',
      ].join('\r\n'));
      const application = read('submitted');
      if (application) zip.file('demo-application.json', JSON.stringify(application, null, 2));
      const now = new Date();
      zip.file('sample-reminders.ics', makeCalendar(upcomingReminders(now), now));
      download(await zip.generateAsync({type: 'blob'}), 'SugboStart-sample-compliance.zip');
      toast(`Demo packet downloaded with ${attachments.length} local attachment(s).`);
    } catch { toast('Export failed. Your local attachments could not be included. Please try again.'); }
  });
}
