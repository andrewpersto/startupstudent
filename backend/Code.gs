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
      if (source === 'prologue' || source === 'prologue-mid') {
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
    ? '<p>You wrote down <strong>' + escapeHtml_(aq) + ' days</strong> for your Agency Quotient. Keep it somewhere you will see it. The book asks for the number again on Day 30 of the sprint, and the direction matters more than the level.</p>'
    : '';
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">Here is the prologue.</p>' +
    '<p>It is called <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>, and it is the two-mile walk across Chicago with $42 in the bank. It takes about twelve minutes.</p>' +
    aqLine +
    '<p>One more thing you can use tonight: the <a href="' + SITE + '/founders-page.html" style="color:#E4572E;font-weight:700">Founder’s Page</a>, the ten lines the book asks you to fill in, ready to print.</p>' +
    '<p>You will hear from me once more, when the book is out. That is all this list is for.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you asked for the prologue at thestudentfounder.com. If that was not you, reply to this email and I will take you off.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'Your prologue: Blood in the Shoes',
    htmlBody: html,
    body: 'Here is the prologue: ' + SITE + '/prologue.html\n\nYou will hear from me once more, when the book is out.\n\nAndrew',
    name: FROM_NAME,
    replyTo: 'andrew@persto.io'
  });
}

function welcomeAfterPrologue_(email) {
  var html =
    '<div style="font-family:Helvetica Neue,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A1A;line-height:1.55;font-size:16px">' +
    '<p style="font-size:22px;font-weight:800;margin:24px 0 8px">You are on the list.</p>' +
    '<p>You read the prologue, so you already know how the elevator ride ends. The rest of the book is the manual for what comes after you step off, and I will write once more when it is out.</p>' +
    '<p>If you want the prologue again, it is here: <a href="' + SITE + '/prologue.html" style="color:#E4572E;font-weight:700">Blood in the Shoes</a>.</p>' +
    '<p>Andrew</p>' +
    '<p style="color:#77726A;font-size:13px;margin-top:32px">You are getting this because you signed up at thestudentfounder.com. If that was not you, reply to this email and I will take you off.</p>' +
    '</div>';
  MailApp.sendEmail({
    to: email,
    subject: 'You are on the list',
    htmlBody: html,
    body: 'You are on the list. I will write once more, when the book is out.\n\nThe prologue is here: ' + SITE + '/prologue.html\n\nAndrew',
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
