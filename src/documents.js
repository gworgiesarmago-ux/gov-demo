import {el, button, modal, toast, download, read, withBusy} from './ui.js';
import {makeCalendar, upcomingReminders, sampleDocument, documentFilename, sampleLookupUrl} from './domain.js';
import {files} from './uploads.js';

export {upcomingReminders} from './domain.js';

const SAMPLE_TITLES = Object.freeze([
  'DTI Certificate of Registration',
  "Mayor's Permit (BPLO)",
  'BIR Certificate of Registration',
  'Commercial Lease Contract',
  'Community Tax Certificate (Cedula)',
]);

function currentDocument(title) {
  return sampleDocument(title, read('profile', {}), read('submitted', {}));
}

function pdfWriter(doc, disclaimer) {
  let y = 0;
  const newPage = () => {
    if (y) doc.addPage();
    doc.setTextColor('#0038a8'); doc.setFontSize(21); doc.text('SugboStart', 20, 22);
    doc.setTextColor('#b91c1c'); doc.setFontSize(10); doc.text(disclaimer, 20, 33);
    y = 48;
  };
  newPage();
  return (value, size = 11, gap = 6) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(value), 170);
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 20) newPage();
      doc.setTextColor('#0f172a'); doc.setFontSize(size); doc.text(line, 20, y);
      y += size * 0.45 + 2;
    }
    y += gap;
  };
}

export async function pdfBlob(title = 'DTI Certificate of Registration') {
  const {jsPDF} = await import('jspdf');
  const model = currentDocument(title);
  const doc = new jsPDF();
  const write = pdfWriter(doc, model.disclaimer);
  doc.setProperties({title: `SAMPLE - ${model.title}`, subject: 'Local demonstration only. Not issued or verified by an agency.', author: 'SugboStart demo'});
  write(model.title, 17, 10);
  for (const [label, value] of Object.entries({Applicant: model.applicant, Business: model.business, Address: model.address, 'Entity type': model.entityType, Location: model.location, 'Local application reference': model.reference})) {
    write(`${label}: ${value}`);
  }
  write(model.details[0], 14);
  write(model.details[1]);
  write('Prepared from the profile saved in this browser. No government record has been checked, verified, or issued. This document cannot be used as a permit, contract, receipt, or proof of registration.');
  write(`Generated: ${new Date().toISOString()}`, 10);
  return doc.output('blob');
}

export function previewDocument(title = 'DTI Certificate of Registration') {
  const model = currentDocument(title);
  const card = el('div', undefined, 'sample-document');
  card.append(el('div', model.disclaimer, 'sample-label'), el('h3', model.title), el('p', model.business),
    el('p', model.applicant), el('p', model.address), el('p', model.reference), el('p', model.details[1]));
  const action = button('Download sample PDF', event => withBusy(event, 'Preparing PDF…', async () => {
    try {
      download(await pdfBlob(model.title), documentFilename(model.title));
      toast('Sample PDF downloaded. It is not valid for official use.');
    } catch { toast('The document could not be generated. Please try again.'); }
  }));
  modal(model.title, [card, action]);
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
      for (const title of SAMPLE_TITLES) zip.file('samples/' + documentFilename(title), await pdfBlob(title));
      for (const [index, file] of attachments.entries()) {
        if (!(file.blob instanceof Blob) || !file.blob.size) throw new Error('An attachment could not be read.');
        zip.file(attachmentName(file, index), await file.blob.arrayBuffer());
      }
      zip.file('README.txt', [
        'SugboStart local demonstration packet',
        'SAMPLE RECORDS ONLY - NOT VALID FOR OFFICIAL USE.',
        'The samples/ folder contains distinct planning summaries generated from the saved local profile. No certificate, contract, permit, or tax record has been issued or verified.',
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
