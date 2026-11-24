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
 * and one welcome email to the subscriber with chapter one (link and PDF).
 */

var NOTIFY_TO = 'andrew@persto.io, andrewashur@gmail.com';
var FROM_NAME = 'The Student Founder';
var SITE = 'https://www.thestudentfounder.com';
var SHEET_NAME = 'Signups';
var HEADERS = ['Timestamp', 'Email', 'AQ (days)', 'Source', 'Page', 'Referrer', 'User agent', 'Status', 'Note', 'ID'];
var COL_NOTE = 9;
var COL_ID = 10;

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.stats === 'aq') return json_(aqStats_());
  return json_({ ok: true, service: 'the-student-founder-signups' });
}

/** Count and median of Agency Quotient answers, for the live number on the site. */
function aqStats_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('aq_stats');
  if (hit) return JSON.parse(hit);
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  var values = last < 2 ? [] : sheet.getRange(2, 3, last - 1, 1).getValues();
  var nums = [];
  for (var i = 0; i < values.length; i++) {
    var n = Number(values[i][0]);
    if (values[i][0] !== '' && !isNaN(n)) nums.push(n);
  }
  nums.sort(function (a, b) { return a - b; });
  var median = null;
  if (nums.length) {
    var mid = Math.floor(nums.length / 2);
    median = nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
  }
  var out = { ok: true, count: nums.length, median: median };
  cache.put('aq_stats', JSON.stringify(out), 300);
  return out;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var p = (e && e.parameter) || {};
    if (p.website) return json_({ ok: true }); // honeypot filled: pretend success, store nothing
    if (p.action === 'note') return json_(saveNote_(p));

    var email = String(p.email || '').trim().toLowerCase();
    if (!isEmail_(email)) return json_({ ok: false, error: 'invalid_email' });

    var aq = String(p.aq_days || '').trim();
    var source = String(p.source || '').slice(0, 40);
    var page = String(p.page || '').slice(0, 200);
    var referrer = String(p.referrer || '').slice(0, 300);
    var ua = String(p.ua || '').slice(0, 300);

    var sheet = getSheet_();
    var status = isDuplicate_(sheet, email) ? 'duplicate' : 'new';
    var id = Utilities.getUuid();
    sheet.appendRow([new Date(), email, aq, source, page, referrer, ua, status, '', id]);

    if (status === 'new') {
      notifyOwner_(email, aq, source, page, referrer);
      if (source === 'prologue' || source === 'prologue-mid') {
        welcomeAfterPrologue_(email);
      } else {
        welcomeReader_(email, aq);
      }
    }
    return json_({ ok: true, status: status, id: id });
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
  if (sheet.getLastRow() > 0 && sheet.getRange(1, HEADERS.length).getValue() !== HEADERS[HEADERS.length - 1]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    sheet.setColumnWidth(COL_NOTE, 360);
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

/** Attach an optional note to the signup row identified by the id returned at signup. */
function saveNote_(p) {
  var id = String(p.id || '').trim();
  var note = String(p.note || '').trim().slice(0, 1000);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'invalid_id' };
  if (!note) return { ok: false, error: 'empty_note' };
  if (/^[=+\-@]/.test(note)) note = "'" + note; // keep Sheets from reading it as a formula
  var sheet = getSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'not_found' };
  var ids = sheet.getRange(2, COL_ID, last - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) {
    if (ids[i][0] === id) {
      var row = i + 2;
      sheet.getRange(row, COL_NOTE).setValue(note);
      var email = sheet.getRange(row, 2).getValue();
      MailApp.sendEmail({
        to: NOTIFY_TO,
        subject: 'Note from ' + email,
        body: email + ' added a note after signing up:\n\n' + note + '\n\nSheet: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
        name: FROM_NAME,
        replyTo: email
      });
      return { ok: true };
    }
  }
  return { ok: false, error: 'not_found' };
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
    ? '<p>You wrote down <strong>' + escapeHtml_(aq) + ' days</strong> for your Agency Quotient. Keep it somewhere you will see it. The book asks for the number again on Day 30 of the sprint, and what it tracks is whether the number is falling toward zero.</p>'
    : '';
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">Here is chapter one.</p>' +
    '<p>It is called <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>, and it is the two-mile walk across Chicago with forty-two dollars in the company account. It takes about thirteen minutes.</p>' +
    '<p>Rather read it offline? <a href="' + SITE + '/the-student-founder-chapter-one.pdf" style="color:#E4572E;font-weight:700">Download the PDF</a>.</p>' +
    aqLine +
    '<p>One more thing you can use tonight: the <a href="' + SITE + '/founders-page.html" style="color:#E4572E;font-weight:700">Founder’s Page</a>, the one-page plan the book asks you to fill in, ready to print. Write line zero tonight.</p>' +
    '<p>I will write when preorders open and again on February 23, 2027, the day the book is out. That is all this list is for.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you asked for chapter one at thestudentfounder.com. If that was not you, reply to this email and I will take you off.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'Chapter one: Blood in the Shoes',
    htmlBody: html,
    body: 'Here is chapter one: ' + SITE + '/prologue.html\n\nThe PDF: ' + SITE + '/the-student-founder-chapter-one.pdf\n\nI will write when preorders open and again on February 23, 2027, the day the book is out.\n\nAndrew',
    name: FROM_NAME,
    replyTo: 'andrewashur@gmail.com'
  });
}

function welcomeAfterPrologue_(email) {
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">You are on the list.</p>' +
    '<p>You read chapter one, so you already know how the elevator ride ends. The rest of the book is the manual for what comes after you step off, and I will write when preorders open and again on February 23, 2027, the day it is out.</p>' +
    '<p>If you want chapter one again, it is here: <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>, or <a href="' + SITE + '/the-student-founder-chapter-one.pdf" style="color:#E4572E;font-weight:700">as a PDF</a> to keep or pass on.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you signed up at thestudentfounder.com. If that was not you, reply to this email and I will take you off.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'You are on the list',
    htmlBody: html,
    body: 'You are on the list. I will write when preorders open and again on February 23, 2027, the day the book is out.\n\nChapter one is here: ' + SITE + '/prologue.html\n\nAndrew',
    name: FROM_NAME,
    replyTo: 'andrewashur@gmail.com'
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
