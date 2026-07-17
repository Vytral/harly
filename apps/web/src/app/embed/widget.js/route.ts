export const runtime = "nodejs";

/**
 * GET /embed/widget.js , self-contained, dependency-free careers widget.
 *
 * A company drops this on their existing careers page:
 *
 *   <div id="harly-jobs-container"></div>
 *   <script src="https://<host>/embed/widget.js"
 *           data-workspace="acme" data-pk="harly_pk_live_..." defer></script>
 *
 * It fetches the public API, renders a searchable job list with filters, and
 * offers an inline apply form (POSTing to the public intake endpoint) with a
 * hosted-apply fallback link. Styles are namespaced (`oh-`) and inherit the
 * host page's typography so it blends into any site.
 *
 * Attributes:
 *   data-workspace  workspace slug (or use data-pk)
 *   data-pk         publishable API key
 *   data-container  target element id (default "harly-jobs-container")
 *   data-job        render ONLY this job's apply form (skip the board)
 *   data-theme      auto | light | dark  (default auto → inherits host)
 *
 * Theming: every color is a CSS custom property scoped to `.oh-root`, so the
 * host can override any of them from its own stylesheet:
 *   --oh-accent  --oh-accent-ink  --oh-fg  --oh-muted  --oh-border  --oh-radius
 *   --oh-surface --oh-surface-2
 * The API's board accent seeds --oh-accent as a fallback; host CSS always wins.
 */
const WIDGET = String.raw`(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) {
    var all = document.getElementsByTagName("script");
    script = all[all.length - 1];
  }
  var origin = new URL(script.src).origin;
  var workspace = script.getAttribute("data-workspace") || "";
  var pk = script.getAttribute("data-pk") || "";
  var containerId = script.getAttribute("data-container") || "harly-jobs-container";
  var singleJobSlug = script.getAttribute("data-job") || "";
  var theme = (script.getAttribute("data-theme") || "auto").toLowerCase();

  function api(path) {
    var url = origin + path;
    var sep = path.indexOf("?") === -1 ? "?" : "&";
    if (workspace) url += sep + "workspace=" + encodeURIComponent(workspace);
    if (pk) url += "&pk=" + encodeURIComponent(pk);
    return url;
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function injectStyles() {
    if (document.getElementById("oh-widget-styles")) return;
    // Named theme presets fill in fg/surface/border pairs; "auto" leaves them
    // inheriting the host via currentColor/transparent so the widget is
    // effectively transparent chrome. Any of these can be overridden by the
    // host's own CSS targeting .oh-root.
    var themes =
      ".oh-root{" +
        "--oh-accent:#111827;--oh-accent-ink:#ffffff;" +
        "--oh-fg:currentColor;" +
        "--oh-muted:color-mix(in srgb, currentColor 62%, transparent);" +
        "--oh-border:color-mix(in srgb, currentColor 16%, transparent);" +
        "--oh-surface:transparent;" +
        "--oh-surface-2:color-mix(in srgb, currentColor 5%, transparent);" +
        "--oh-radius:12px;" +
      "}" +
      ".oh-root[data-theme='light']{" +
        "--oh-fg:#18181b;--oh-muted:#71717a;--oh-border:#e4e4e7;" +
        "--oh-surface:#ffffff;--oh-surface-2:#f4f4f5;" +
      "}" +
      ".oh-root[data-theme='dark']{" +
        "--oh-fg:#fafafa;--oh-muted:#a1a1aa;--oh-border:#27272a;" +
        "--oh-surface:#18181b;--oh-surface-2:#27272a;" +
      "}";
    var css =
      themes +
      ".oh-root{font-family:inherit;color:var(--oh-fg);line-height:1.5}" +
      ".oh-root *,.oh-root *::before,.oh-root *::after{box-sizing:border-box}" +
      ".oh-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}" +
      ".oh-input,.oh-select{padding:8px 10px;border:1px solid var(--oh-border);border-radius:var(--oh-radius);font:inherit;color:inherit;background:var(--oh-surface);flex:1;min-width:140px;transition:border-color .15s ease,box-shadow .15s ease}" +
      ".oh-input:focus,.oh-select:focus{outline:none;border-color:var(--oh-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--oh-accent) 22%, transparent)}" +
      ".oh-list{display:flex;flex-direction:column;gap:10px}" +
      ".oh-card{border:1px solid var(--oh-border);border-radius:calc(var(--oh-radius) + 4px);padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;background:var(--oh-surface);transition:border-color .15s ease,transform .15s ease}" +
      ".oh-card h3{margin:0 0 4px;font-size:1.05em}" +
      ".oh-meta{font-size:.85em;color:var(--oh-muted)}" +
      ".oh-btn{padding:8px 14px;border:0;border-radius:var(--oh-radius);background:var(--oh-accent);color:var(--oh-accent-ink);cursor:pointer;font:inherit;font-weight:600;text-decoration:none;white-space:nowrap;transition:transform .12s ease,filter .15s ease}" +
      ".oh-btn:disabled{opacity:.55;cursor:not-allowed}" +
      ".oh-btn.secondary{background:var(--oh-surface-2);color:var(--oh-fg)}" +
      ".oh-btn:active{transform:scale(.97)}" +
      ".oh-field{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}" +
      ".oh-field label{font-size:.85em;font-weight:600}" +
      ".oh-req{color:var(--oh-accent);margin-left:2px}" +
      ".oh-empty,.oh-error{padding:16px;color:var(--oh-muted)}" +
      ".oh-back{background:none;border:0;cursor:pointer;font:inherit;color:var(--oh-accent);padding:0;margin-bottom:12px}" +
      ".oh-note{font-size:.85em;color:var(--oh-muted);margin-top:8px}" +
      ".oh-turnstile{margin:12px 0}" +
      "@media (hover:hover){.oh-card:hover{border-color:color-mix(in srgb, currentColor 32%, transparent)}.oh-btn:hover{filter:brightness(1.06)}}" +
      "@media (prefers-reduced-motion:reduce){.oh-root *{transition:none!important}}";
    var style = el("style");
    style.id = "oh-widget-styles";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  function applyTheme(root, board) {
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    }
    // Seed the accent from the workspace brand as a FALLBACK only: set it via
    // an inline property with lowest priority so a host stylesheet rule on
    // .oh-root still overrides it.
    if (board && board.accentColor) {
      root.style.setProperty("--oh-accent", board.accentColor);
      // Pick readable ink for the accent (simple luminance test).
      root.style.setProperty("--oh-accent-ink", accentInk(board.accentColor));
    }
  }

  function accentInk(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#ffffff";
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? "#111827" : "#ffffff";
  }

  var ALLOWED_RESUME = {
    "application/pdf": 1,
    "application/msword": 1,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 1
  };

  function render(container, jobs, board) {
    container.innerHTML = "";
    var root = el("div", "oh-root");
    applyTheme(root, board);

    var controls = el("div", "oh-controls");
    var search = el("input", "oh-input");
    search.placeholder = "Search jobs";
    var deptSelect = el("select", "oh-select");
    deptSelect.appendChild(new Option("All departments", ""));
    var depts = {};
    jobs.forEach(function (j) { if (j.department) depts[j.department] = 1; });
    Object.keys(depts).sort().forEach(function (d) { deptSelect.appendChild(new Option(d, d)); });
    controls.appendChild(search);
    if (Object.keys(depts).length) controls.appendChild(deptSelect);
    root.appendChild(controls);

    var list = el("div", "oh-list");
    root.appendChild(list);
    container.appendChild(root);

    function draw() {
      var q = search.value.toLowerCase();
      var dept = deptSelect.value;
      list.innerHTML = "";
      var shown = jobs.filter(function (j) {
        if (dept && j.department !== dept) return false;
        if (q && (j.title + " " + (j.location || "")).toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      if (!shown.length) { list.appendChild(el("div", "oh-empty", "No open roles right now.")); return; }
      shown.forEach(function (job) {
        var card = el("div", "oh-card");
        var info = el("div");
        info.appendChild(el("h3", null, job.title));
        var bits = [];
        if (job.department) bits.push(job.department);
        if (job.location) bits.push(job.location);
        if (job.workplaceType) bits.push(job.workplaceType);
        info.appendChild(el("div", "oh-meta", bits.join(" · ")));
        var btn = el("button", "oh-btn", "Apply");
        btn.onclick = function () { openApply(container, job, board, jobs); };
        card.appendChild(info);
        card.appendChild(btn);
        list.appendChild(card);
      });
    }
    search.oninput = draw;
    deptSelect.onchange = draw;
    draw();
  }

  function field(labelText, input, required) {
    var wrap = el("div", "oh-field");
    var label = el("label", null, labelText);
    if (required) label.appendChild(el("span", "oh-req", "*"));
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  // Load the Cloudflare Turnstile script once and resolve when window.turnstile
  // is ready. The embed renders the apply form on the host's page, so the
  // challenge MUST run here or the public intake endpoint rejects the submit.
  var turnstileReady = null;
  function loadTurnstile() {
    if (turnstileReady) return turnstileReady;
    turnstileReady = new Promise(function (resolve) {
      if (window.turnstile) { resolve(window.turnstile); return; }
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(window.turnstile || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return turnstileReady;
  }

  function openApply(container, job, board, allJobs) {
    container.innerHTML = "";
    var root = el("div", "oh-root");
    applyTheme(root, board);
    if (allJobs) {
      var back = el("button", "oh-back", "← Back to all jobs");
      back.onclick = function () { render(container, allJobs, board); };
      root.appendChild(back);
    }
    root.appendChild(el("h3", null, "Apply — " + job.title));

    var form = el("form");
    var first = el("input", "oh-input"); first.required = true;
    var last = el("input", "oh-input"); last.required = true;
    var email = el("input", "oh-input"); email.type = "email"; email.required = true;
    form.appendChild(field("First name", first, true));
    form.appendChild(field("Last name", last, true));
    form.appendChild(field("Email", email, true));

    // Config-driven optional fields. Populated once the job detail resolves.
    var extra = { phone: null, address: null, headline: null, coverLetter: null,
                  linkedinUrl: null, githubUrl: null, websiteUrl: null };
    var resume = null;
    var questionInputs = [];
    var turnstileToken = null;

    var submitWrap = el("div");
    var submit = el("button", "oh-btn", "Submit application");
    submit.type = "submit";
    submitWrap.appendChild(submit);
    var hosted = el("a", "oh-btn secondary", "Open hosted form");
    hosted.href = job.hostedApplyUrl;
    hosted.target = "_blank";
    hosted.style.marginLeft = "8px";
    submitWrap.appendChild(hosted);

    var turnstileBox = el("div", "oh-turnstile");
    form.appendChild(turnstileBox);
    form.appendChild(submitWrap);

    var status = el("div", "oh-note");
    form.appendChild(status);

    // Build config-aware fields from the job detail, inserted before submit.
    function textInput(type) {
      var i = el(type === "textarea" ? "textarea" : "input", "oh-input");
      if (type === "url") i.type = "url";
      return i;
    }
    function addField(key, labelText, cfg, type) {
      if (!cfg || cfg.visibility === "disabled") return;
      var required = cfg.visibility === "required";
      var input = textInput(type);
      if (required) input.required = true;
      extra[key] = input;
      form.insertBefore(field(labelText, input, required), turnstileBox);
    }

    fetch(api("/api/public/v1/jobs/" + encodeURIComponent(job.slug)))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var data = (body && body.data) || {};
        var cfg = data.applicationConfig;
        if (cfg && cfg.sections) {
          var p = cfg.sections.personal || {};
          var pr = cfg.sections.profile || {};
          var d = cfg.sections.details || {};
          addField("phone", "Phone", p.phone, "text");
          addField("headline", "Headline", p.headline, "text");
          addField("address", "Location", p.address, "text");
          // Resume upload
          if (pr.resume && pr.resume.visibility !== "disabled") {
            resume = el("input", "oh-input");
            resume.type = "file";
            resume.accept = ".pdf,.doc,.docx";
            form.insertBefore(field("Resume", resume, pr.resume.visibility === "required"), turnstileBox);
          }
          addField("linkedinUrl", "LinkedIn", pr.linkedinUrl, "url");
          addField("githubUrl", "GitHub", pr.githubUrl, "url");
          addField("websiteUrl", "Website", pr.websiteUrl, "url");
          addField("coverLetter", "Cover letter", d.coverLetter, "textarea");
        } else {
          // No config → fall back to a resume field so the form is still useful.
          resume = el("input", "oh-input");
          resume.type = "file";
          resume.accept = ".pdf,.doc,.docx";
          form.insertBefore(field("Resume", resume, false), turnstileBox);
        }

        var questions = (cfg && cfg.questions) || [];
        questions.forEach(function (qn) {
          var input = textInput(qn.type === "textarea" ? "textarea" : (qn.type === "url" ? "url" : "text"));
          if (qn.required) input.required = true;
          questionInputs.push({ id: qn.id, input: input });
          form.insertBefore(field(qn.label, input, qn.required), turnstileBox);
        });

        // Render Turnstile if the workspace requires it.
        if (data.turnstileSiteKey) {
          submit.disabled = true;
          loadTurnstile().then(function (ts) {
            if (!ts) { submit.disabled = false; return; }
            ts.render(turnstileBox, {
              sitekey: data.turnstileSiteKey,
              callback: function (token) { turnstileToken = token; submit.disabled = false; },
              "expired-callback": function () { turnstileToken = null; submit.disabled = true; },
              "error-callback": function () { turnstileToken = null; submit.disabled = true; }
            });
          });
        }
      })
      .catch(function () {});

    form.onsubmit = function (e) {
      e.preventDefault();
      submit.disabled = true;
      status.textContent = "Submitting…";
      var answers = {};
      questionInputs.forEach(function (q) { answers[q.id] = q.input.value; });
      var payload = {
        firstName: first.value, lastName: last.value, email: email.value,
        questionAnswers: answers
      };
      Object.keys(extra).forEach(function (k) {
        if (extra[k] && extra[k].value) payload[k] = extra[k].value;
      });
      if (turnstileToken) payload.turnstileToken = turnstileToken;

      uploadResume(resume && resume.files && resume.files[0]).then(function (resumeFields) {
        if (resumeFields) Object.assign(payload, resumeFields);
        return fetch(api("/api/public/v1/jobs/" + encodeURIComponent(job.slug) + "/applications"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
      }).then(function (r) {
        return r.json().then(function (b) { return { ok: r.ok, body: b }; });
      }).then(function (res) {
        if (res.ok) {
          container.innerHTML = "";
          var done = el("div", "oh-root");
          applyTheme(done, board);
          done.appendChild(el("h3", null, "Application received"));
          done.appendChild(el("p", null, "Thanks for applying to " + job.title + "."));
          container.appendChild(done);
        } else {
          submit.disabled = false;
          status.textContent = (res.body && res.body.error && res.body.error.message) || "Could not submit. Try the hosted form.";
        }
      }).catch(function () {
        submit.disabled = false;
        status.textContent = "Network error. Try the hosted form.";
      });
    };

    function uploadResume(file) {
      if (!file) return Promise.resolve(null);
      if (!ALLOWED_RESUME[file.type]) {
        return Promise.reject(new Error("Unsupported file type"));
      }
      return fetch(api("/api/public/v1/resume/presign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, contentType: file.type, contentLength: file.size })
      }).then(function (r) { return r.json(); }).then(function (b) {
        var d = b && b.data;
        if (!d || !d.uploadUrl) throw new Error("presign failed");
        return fetch(d.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
          .then(function () {
            return {
              resumeUrl: d.fileUrl, resumeKey: d.key, resumeFileName: file.name,
              resumeFileType: file.type, resumeFileSize: file.size
            };
          });
      });
    }

    root.appendChild(form);
    container.appendChild(root);
  }

  function boot() {
    var container = document.getElementById(containerId);
    if (!container) return;
    injectStyles();
    if (!workspace && !pk) {
      container.innerHTML = "";
      container.appendChild(el("div", "oh-error", "Harly widget: set data-workspace or data-pk."));
      return;
    }

    // Single-job mode: mount only that job's apply form, no board listing.
    if (singleJobSlug) {
      container.appendChild(el("div", "oh-empty", "Loading…"));
      fetch(api("/api/public/v1/jobs/" + encodeURIComponent(singleJobSlug)))
        .then(function (r) { return r.json(); })
        .then(function (body) {
          var job = body && body.data && body.data.job;
          if (!job) throw new Error("not found");
          container.innerHTML = "";
          openApply(container, job, null, null);
        })
        .catch(function () {
          container.innerHTML = "";
          container.appendChild(el("div", "oh-error", "Could not load this job."));
        });
      return;
    }

    container.appendChild(el("div", "oh-empty", "Loading open roles…"));
    fetch(api("/api/public/v1/jobs"))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var jobs = (body && body.data && body.data.jobs) || [];
        var board = (body && body.data && body.data.board) || null;
        render(container, jobs, board);
      })
      .catch(function () {
        container.innerHTML = "";
        container.appendChild(el("div", "oh-error", "Could not load jobs."));
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`;

export function GET() {
  return new Response(WIDGET, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
