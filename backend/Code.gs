/**
 * The Student Founder — signup backend.
 *
 * Bound to the Google Sheet "The Student Founder - Signups".
 * Deployed as a Web App (Execute as: Me, Who has access: Anyone).
 *
 * The website POSTs a form (application/x-www-form-urlencoded) with:
 *   email      (required)
 *   aq_days    (optional) Agency Quotient answer, in days
 *   source     (optional) which form on the site, e.g. "hero", "aq", "prologue", "final"
 *   page       (optional) page path
 *   referrer   (optional) document.referrer
 *   website    honeypot; must be empty
 *
 * Each signup: one row appended to the sheet, one notification email to NOTIFY_TO,
 * and one welcome email to the subscriber with the prologue link.
 */

var NOTIFY_TO = 'andrew@persto.io, andrewashur@gmail.com';
var FROM_NAME = 'The Student Founder';
var SITE = 'https://www.thestudentfounder.com';
var SHEET_NAME = 'Signups';
var HEADERS = ['Timestamp', 'Email', 'AQ (days)', 'Source', 'Page', 'Referrer', 'User agent', 'Status'];

function doGet(e) {
  return json_({ ok: true, service: 'the-student-founder-signups' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return json_({ ok: true }); // honeypot filled: pretend success, store nothing

    var email = String(p.email || '').trim().toLowerCase();
    if (!isEmail_(email)) return json_({ ok: false, error: 'invalid_email' });

    var aq = String(p.aq_days || '').trim();
    var source = String(p.source || '').slice(0, 40);
    var page = String(p.page || '').slice(0, 200);
    var referrer = String(p.referrer || '').slice(0, 300);
    var ua = String(p.ua || '').slice(0, 300);

    var sheet = getSheet_();
    var status = isDuplicate_(sheet, email) ? 'duplicate' : 'new';
    sheet.appendRow([new Date(), email, aq, source, page, referrer, ua, status]);

    if (status === 'new') {
      notifyOwner_(email, aq, source, page, referrer);
      if (source === 'prologue') {
        welcomeAfterPrologue_(email);
      } else {
        welcomeReader_(email, aq);
      }
    }
    return json_({ ok: true, status: status });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 170);
    sheet.setColumnWidth(2, 260);
  }
  return sheet;
}

function isDuplicate_(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var emails = sheet.getRange(2, 2, last - 1, 1).getValues();
  for (var i = 0; i < emails.length; i++) {
    if (String(emails[i][0]).toLowerCase() === email) return true;
  }
  return false;
}

function notifyOwner_(email, aq, source, page, referrer) {
  var lines = [
    'New signup: ' + email,
    '',
    'Agency Quotient: ' + (aq ? aq + ' days' : 'not answered'),
    'Form: ' + (source || 'unknown'),
    'Page: ' + (page || 'unknown'),
    'Referrer: ' + (referrer || 'direct'),
    '',
    'Sheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl()
  ];
  MailApp.sendEmail({
    to: NOTIFY_TO,
    subject: 'New signup: ' + email + (aq ? ' (AQ ' + aq + ' days)' : ''),
    body: lines.join('\n'),
    name: FROM_NAME
  });
}

function welcomeReader_(email, aq) {
  var aqLine = aq
    ? '<p>You wrote down <strong>' + escapeHtml_(aq) + ' days</strong>. Keep the number. The book asks you to take it again on Day 30 of the sprint, and the direction matters more than the level.</p>'
    : '';
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">The prologue is yours.</p>' +
    '<p>Read it here: <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>.</p>' +
    '<p>It is the two-mile walk across Chicago, the twenty-eighth floor, and the $42. It is about a twelve-minute read.</p>' +
    aqLine +
    '<p>One more email will come from me, once, when the book is out. That is the whole list.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you asked for the prologue at thestudentfounder.com. Reply to this email if you did not, and I will remove you.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'Your prologue: Blood in the Shoes',
    htmlBody: html,
    body: 'Read the prologue here: ' + SITE + '/prologue.html\n\nOne more email will come, once, when the book is out.\n\nAndrew',
    name: FROM_NAME,
    replyTo: 'andrew@persto.io'
  });
}

function welcomeAfterPrologue_(email) {
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">You are on the list.</p>' +
    '<p>You read the prologue, so you know how the elevator ride ends. The rest of the book is the manual for what comes after you step off.</p>' +
    '<p>One email will come from me, once, when the book is out. That is the whole list.</p>' +
    '<p>If you want the prologue again, it lives here: <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you signed up at thestudentfounder.com. Reply to this email if you did not, and I will remove you.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'You are on the list',
    htmlBody: html,
    body: 'You are on the list. One email will come, once, when the book is out.\n\nThe prologue lives here: ' + SITE + '/prologue.html\n\nAndrew',
    name: FROM_NAME,
    replyTo: 'andrew@persto.io'
  });
}

function isEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length < 200;
}

function escapeHtml_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Run once from the editor to create headers and confirm permissions. */
function setup() {
  getSheet_();
}
