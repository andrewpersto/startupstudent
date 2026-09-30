/* The Student Founder — site behavior.
   Signup forms post to a Google Apps Script web app that writes to a Google Sheet
   and sends the notification + welcome emails. */

(function () {
  'use strict';

  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbx9RlRL4sLZrTAoRuuaAoxf5gRypanyWEJR69WZG55gNbZynzUC2U4AdFn5pOiJ8-tVqw/exec';
  var SITE = 'https://www.thestudentfounder.com';
  // Set this to the retail pre-order link when it exists. Empty means no pre-order button.
  var PREORDER_URL = '';

  /* Google Analytics events. No-op when gtag is absent or blocked. */
  function track(name, params) {
    if (typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params || {}); } catch (e) {}
  }

  /* ---------- Agency Quotient ---------- */
  var aqInput = document.getElementById('aq-days');
  var aqReadout = document.getElementById('aq-readout');
  var aqShare = document.getElementById('aq-share');
  var aqEcho = document.getElementById('aq-echo');
  var aqCopy = document.getElementById('aq-copy');
  var aqX = document.getElementById('aq-x');
  var runIt = document.getElementById('run-it');
  var aqValue = '';
  var aqTracked = false;

  var DEFAULT_READOUT = aqReadout ? aqReadout.innerHTML : '';

  /* Live count of answers, shown once there are enough to mean something. */
  var aqLive = document.getElementById('aq-live');
  if (aqLive && ENDPOINT.indexOf('http') === 0 && window.fetch) {
    fetch(ENDPOINT + '?stats=aq', { redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.count >= 20 && d.median !== null) {
          document.getElementById('aq-live-count').textContent = d.count.toLocaleString();
          document.getElementById('aq-live-median').textContent = d.median;
          aqLive.hidden = false;
        }
      })
      .catch(function () {});
  }

  function readoutFor(n) {
    if (n === 0) {
      return '<strong>Same day.</strong> That is the habit this whole book is trying to build, so the only question left is whether the next idea gets the same treatment.';
    }
    if (n <= 7) {
      return '<strong>Under a week.</strong> The idea got out of your head while it was still warm. Most of the book is about doing that on purpose, every time.';
    }
    if (n <= 30) {
      return '<strong>About a month.</strong> Long enough for the idea to cool and the doubts to move in. The 30-day sprint at the back of the book exists for exactly this number.';
    }
    if (n <= 365) {
      return '<strong>Most of a year.</strong> That is not a time problem. It is a priority problem, and it is the one variable in the book that is entirely in your hands.';
    }
    return '<strong>Over a year,</strong> and the idea is probably still sitting there. Nothing about your bank account, your major, or your connections set that number, which is the good news, because it means you can move it.';
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
        if (!aqTracked) { aqTracked = true; track('aq_answered', { aq_days: n }); }
      }
      if (runIt) runIt.hidden = isNaN(n);
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

    var finish = function (ok, errMsg, signupId) {
      button.disabled = false;
      button.textContent = label;
      if (ok) {
        form.classList.add('is-done');
        setStatus(form, '', null);
        try { window.localStorage.setItem('tsf_signed_up', '1'); } catch (e) {}
        document.dispatchEvent(new Event('tsf:signed-up'));
        track('sign_up', { method: 'email', form_source: form.getAttribute('data-source') || '', aq_days: aqValue || undefined });
        if (signupId) addNoteForm(form, signupId);
        Array.prototype.forEach.call(document.querySelectorAll('form.signup'), function (f) {
          if (f !== form) markListed(f);
        });
      } else {
        setStatus(form, errMsg || 'Something broke on our end. Try again in a minute, or email andrewashur@gmail.com.', 'error');
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
          finish(true, null, data.id);
        } else if (data && data.error === 'invalid_email') {
          finish(false, 'That email doesn’t look complete. Check it and try again.');
        } else {
          finish(false);
        }
      })
      .catch(function () { finish(false); });
  }

  /* ---------- Optional note after signup ---------- */
  var noteCount = 0;
  function addNoteForm(form, signupId) {
    var done = form.querySelector('.done');
    if (!done || done.querySelector('.note')) return;
    noteCount += 1;
    var nid = 'note-' + noteCount;
    var wrap = document.createElement('div');
    wrap.className = 'note';
    wrap.innerHTML =
      '<label for="' + nid + '">Anything you want to tell me? What you\u2019re building, or what\u2019s stopping you.</label>' +
      '<textarea id="' + nid + '" rows="3" maxlength="1000" placeholder="Optional"></textarea>' +
      '<div class="note-row"><button type="button">Send note</button><span class="note-hint">It comes straight to my inbox.</span></div>' +
      '<p class="note-status" role="status" aria-live="polite"></p>';
    done.appendChild(wrap);
    var ta = wrap.querySelector('textarea');
    var btn = wrap.querySelector('button');
    var status = wrap.querySelector('.note-status');
    btn.addEventListener('click', function () {
      var note = ta.value.trim();
      if (!note) { status.textContent = 'Write something first, or skip it. It\u2019s optional.'; ta.focus(); return; }
      btn.disabled = true;
      btn.textContent = 'Sending';
      var body = new URLSearchParams();
      body.set('action', 'note');
      body.set('id', signupId);
      body.set('note', note);
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        redirect: 'follow'
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok) {
            wrap.innerHTML = '<p class="note-sent"><strong>Got it.</strong> Thanks for telling me.</p>';
            track('note_sent', { form_source: form.getAttribute('data-source') || '' });
          } else {
            throw new Error('not ok');
          }
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Send note';
          status.textContent = 'That didn\u2019t send. Try again in a minute.';
        });
    });
  }

  var forms = document.querySelectorAll('form.signup');
  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      submitForm(form);
    });
  });

  var alreadySignedUp = false;
  try { alreadySignedUp = window.localStorage.getItem('tsf_signed_up') === '1'; } catch (e) {}

  /* People already on the list see a confirmation instead of another form. */
  function markListed(form) {
    if (form.classList.contains('is-done')) return;
    form.classList.add('is-done', 'is-returning');
    var done = form.querySelector('.done');
    if (done) {
      done.innerHTML = '<strong>You\u2019re on the list.</strong> The book is out February 2027, and you\u2019ll hear the day it\u2019s available.';
    }
  }
  if (alreadySignedUp) Array.prototype.forEach.call(forms, markListed);

  /* Pre-order button, dormant until PREORDER_URL is set. */
  if (PREORDER_URL) {
    var aside = document.querySelector('.hero-aside');
    if (aside) {
      var btn = document.createElement('a');
      btn.className = 'preorder';
      btn.href = PREORDER_URL;
      btn.textContent = 'Pre-order the book';
      aside.insertBefore(btn, aside.firstChild);
    }
  }

  /* ---------- Sticky CTA on small screens ---------- */
  var sticky = document.querySelector('.sticky-cta');
  if (sticky && !alreadySignedUp && forms.length) {
    var formsInView = 0;
    var pastHero = false;
    var updateSticky = function () {
      var show = pastHero && formsInView === 0 && !document.body.classList.contains('signed-up');
      sticky.hidden = !show;
      sticky.classList.toggle('is-visible', show);
    };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.target === forms[0]) { pastHero = !en.isIntersecting && en.boundingClientRect.top < 0; }
          formsInView += en.isIntersecting ? 1 : -1;
          if (formsInView < 0) formsInView = 0;
        });
        updateSticky();
      }, { threshold: 0.2 });
      Array.prototype.forEach.call(forms, function (f) { io.observe(f); });
    }
    document.addEventListener('tsf:signed-up', function () {
      document.body.classList.add('signed-up');
      updateSticky();
    });
  }

  /* ---------- Top bar background after scroll ---------- */
  var top = document.querySelector('.top');
  if (top) {
    var onTop = function () { top.classList.toggle('is-scrolled', window.scrollY > 24); };
    window.addEventListener('scroll', onTop, { passive: true });
    onTop();
  }

  /* ---------- Draw the line when it comes into view ---------- */
  var lineFigure = document.querySelector('.line-figure');
  if (lineFigure) {
    if ('IntersectionObserver' in window) {
      var lio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { lineFigure.classList.add('is-drawn'); lio.disconnect(); }
        });
      }, { threshold: 0.35 });
      lio.observe(lineFigure);
    } else {
      lineFigure.classList.add('is-drawn');
    }
  }

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
