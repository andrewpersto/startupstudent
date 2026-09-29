/* The Student Founder — site behavior.
   Signup forms post to a Google Apps Script web app that writes to a Google Sheet
   and sends the notification + welcome emails. */

(function () {
  'use strict';

  var ENDPOINT = 'REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL';
  var SITE = 'https://www.thestudentfounder.com';

  /* ---------- Agency Quotient ---------- */
  var aqInput = document.getElementById('aq-days');
  var aqReadout = document.getElementById('aq-readout');
  var aqShare = document.getElementById('aq-share');
  var aqEcho = document.getElementById('aq-echo');
  var aqCopy = document.getElementById('aq-copy');
  var aqX = document.getElementById('aq-x');
  var aqValue = '';

  var DEFAULT_READOUT = aqReadout ? aqReadout.innerHTML : '';

  function readoutFor(n) {
    if (n === 0) {
      return '<strong>Same day.</strong> That is the gap the whole book is trying to make your default. The question is whether the next idea gets the same treatment.';
    }
    if (n <= 7) {
      return '<strong>Under a week.</strong> The idea got out of your head while it was still warm. The book’s job is to make that the rule, not the exception.';
    }
    if (n <= 30) {
      return '<strong>About a month.</strong> Long enough for the idea to cool and the doubts to move in. The 30-day sprint at the back of the book exists for exactly this number.';
    }
    if (n <= 365) {
      return '<strong>Most of a year.</strong> That is not a time problem. It is a priority problem, and it is the one variable in the book that is entirely in your hands.';
    }
    return '<strong>Over a year.</strong> The idea is still there, and so is the gap. Nothing about your bank account, your major, or your connections set this number. That is the good news.';
  }

  function updateAQ() {
    var raw = aqInput.value.trim();
    var n = raw === '' ? NaN : Math.max(0, Math.floor(Number(raw)));
    aqReadout.classList.add('is-updating');
    window.setTimeout(function () {
      if (isNaN(n)) {
        aqValue = '';
        aqReadout.innerHTML = DEFAULT_READOUT;
        aqShare.hidden = true;
      } else {
        aqValue = String(n);
        aqReadout.innerHTML = readoutFor(n);
        aqEcho.textContent = aqValue;
        var text = 'My Agency Quotient: ' + aqValue + ' day' + (n === 1 ? '' : 's') + ' between the idea and the first action. What’s yours? ' + SITE + '/#aq';
        aqX.href = 'https://x.com/intent/post?text=' + encodeURIComponent(text);
        aqShare.hidden = false;
      }
      aqReadout.classList.remove('is-updating');
    }, 120);
  }

  if (aqInput) {
    aqInput.addEventListener('input', updateAQ);
    aqCopy.addEventListener('click', function () {
      var line = 'Mine was ' + aqValue + ' days. ' + SITE + '/#aq';
      var done = function () {
        aqCopy.textContent = 'Copied';
        window.setTimeout(function () { aqCopy.textContent = 'Copy'; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(line).then(done, done);
      } else {
        done();
      }
    });
  }

  /* ---------- Signup forms ---------- */
  function setStatus(form, msg, state) {
    var el = form.querySelector('.status');
    if (!el) return;
    el.textContent = msg || '';
    if (state) { el.setAttribute('data-state', state); } else { el.removeAttribute('data-state'); }
  }

  function validEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
  }

  function submitForm(form) {
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');
    var email = (input.value || '').trim();

    if (!validEmail(email)) {
      setStatus(form, 'That email doesn’t look complete. Check it and try again.', 'error');
      input.focus();
      return;
    }

    var body = new URLSearchParams();
    body.set('email', email);
    body.set('source', form.getAttribute('data-source') || '');
    body.set('page', window.location.pathname);
    body.set('referrer', document.referrer || '');
    body.set('ua', navigator.userAgent || '');
    body.set('website', (form.querySelector('input[name="website"]') || {}).value || '');
    if (aqValue !== '') body.set('aq_days', aqValue);

    button.disabled = true;
    var label = button.textContent;
    button.textContent = 'Sending';
    setStatus(form, '', null);

    var finish = function (ok, errMsg) {
      button.disabled = false;
      button.textContent = label;
      if (ok) {
        form.classList.add('is-done');
        setStatus(form, '', null);
        try { window.localStorage.setItem('tsf_signed_up', '1'); } catch (e) {}
      } else {
        setStatus(form, errMsg || 'Something broke on our end. Try again in a minute, or email andrew@persto.io.', 'error');
      }
    };

    if (!ENDPOINT || ENDPOINT.indexOf('http') !== 0) {
      finish(false, 'Signups aren’t connected yet. Read the prologue in the meantime.');
      return;
    }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      redirect: 'follow'
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) {
          finish(true);
        } else if (data && data.error === 'invalid_email') {
          finish(false, 'That email doesn’t look complete. Check it and try again.');
        } else {
          finish(false);
        }
      })
      .catch(function () { finish(false); });
  }

  Array.prototype.forEach.call(document.querySelectorAll('form.signup'), function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(form);
    });
  });

  /* ---------- Reading progress (prologue) ---------- */
  var progress = document.querySelector('.progress');
  if (progress) {
    var onScroll = function () {
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var pct = max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0;
      progress.style.width = pct + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
