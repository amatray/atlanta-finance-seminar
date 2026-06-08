/* Atlanta Finance Seminar - signup hydration.
 *
 * Reads/writes go to the Apps Script web app via JSONP (a ?callback= GET), which
 * sidesteps CORS entirely. window.SEMINAR_API holds the /exec URL; when empty,
 * every widget degrades to a "email the organizer" link. The static schedule
 * renders without this script (progressive enhancement); this only adds the
 * live seat counts and the reservation form.
 */
(function () {
  "use strict";

  var API = window.SEMINAR_API || "";
  var ORGANIZER = "adrien.matray@gmail.com";
  var jsonpSeq = 0;

  function jsonp(params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!API) { reject(new Error("no-api")); return; }
      var cb = "__seminar_cb_" + (++jsonpSeq) + "_" + Date.now();
      var script = document.createElement("script");
      var timer = setTimeout(function () { cleanup(); reject(new Error("timeout")); }, timeoutMs || 12000);
      function cleanup() {
        clearTimeout(timer);
        delete window[cb];
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (data) { cleanup(); resolve(data); };
      var qs = ["callback=" + cb];
      Object.keys(params).forEach(function (k) {
        qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k]));
      });
      script.src = API + (API.indexOf("?") === -1 ? "?" : "&") + qs.join("&");
      script.onerror = function () { cleanup(); reject(new Error("network")); };
      document.head.appendChild(script);
    });
  }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }

  // No JSONP API yet: leave the server-rendered "Reserve a seat" button in place.
  function keepButton() { /* no-op */ }

  function renderForm(container, info) {
    container.innerHTML = "";

    var status = el("p", { "class": "seat-status " + (info.spotsRemaining > 0 ? "open" : "full") });
    if (!info.registrationOpen) {
      status.textContent = "Registration for this session is closed.";
      status.className = "seat-status full";
      container.appendChild(status);
      return;
    }
    status.textContent = info.spotsRemaining > 0
      ? info.spotsRemaining + " seat" + (info.spotsRemaining === 1 ? "" : "s") + " remaining"
      : "This session is full. You can join the waitlist.";
    container.appendChild(status);

    var form = el("form");
    var startedAt = Date.now();

    var lName = el("label", null, "Name");
    var iName = el("input", { type: "text", name: "name", required: "required", autocomplete: "name" });
    lName.appendChild(iName);

    var lEmail = el("label", null, "Email");
    var iEmail = el("input", { type: "email", name: "email", required: "required", autocomplete: "email" });
    lEmail.appendChild(iEmail);

    // Honeypot: real users never fill this; bots often do.
    var hp = el("input", { type: "text", name: "company", "class": "hp", tabindex: "-1", autocomplete: "off" });
    var hpWrap = el("div", { "class": "hp", "aria-hidden": "true" });
    hpWrap.appendChild(hp);

    var submit = el("button", { type: "submit", "class": "btn" },
      info.spotsRemaining > 0 ? "Reserve a seat" : "Join the waitlist");

    var msg = el("p", { "class": "msg", role: "status", "aria-live": "polite" });

    var consent = el("p", { "class": "consent" },
      "Your name and email are used only to manage this reservation and seminar reminders.");

    form.appendChild(lName);
    form.appendChild(lEmail);
    form.appendChild(hpWrap);
    form.appendChild(submit);
    form.appendChild(consent);
    form.appendChild(msg);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      msg.className = "msg";
      msg.textContent = "";
      if (hp.value) { return; } // honeypot tripped: silently drop
      submit.disabled = true;
      submit.textContent = "Submitting...";
      jsonp({
        action: "signup",
        name: iName.value.trim(),
        email: iEmail.value.trim(),
        date: info.date,
        hp: hp.value,
        elapsed: Date.now() - startedAt
      }).then(function (res) {
        if (res && res.ok) {
          form.innerHTML = "";
          msg.className = "msg ok";
          msg.textContent = (res.data && res.data.message) || "You are registered. Check your email.";
          form.appendChild(msg);
        } else {
          submit.disabled = false;
          submit.textContent = "Try again";
          msg.className = "msg err";
          msg.textContent = (res && res.error) || "Could not complete the reservation.";
        }
      }).catch(function () {
        submit.disabled = false;
        submit.textContent = "Reserve a seat";
        msg.className = "msg err";
        msg.textContent = "Network problem. Please email the organizer to reserve.";
      });
    });

    container.appendChild(form);
  }

  function hydrate() {
    var containers = Array.prototype.slice.call(document.querySelectorAll(".signup[data-seminar-date]"));
    if (!containers.length) return;

    // Until the JSONP API is deployed, the server-rendered "Reserve a seat"
    // button (linking to the live web app) is the reservation path.
    if (!API) { keepButton(); return; }

    jsonp({ action: "getSchedule" }).then(function (data) {
      var byDate = {};
      (Array.isArray(data) ? data : (data && data.data) || []).forEach(function (s) { byDate[s.date] = s; });
      containers.forEach(function (c) {
        var d = c.getAttribute("data-seminar-date");
        if (byDate[d]) { renderForm(c, byDate[d]); }
      });
    }).catch(keepButton);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", hydrate);
  } else {
    hydrate();
  }
})();
