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
    var css =
      ".oh-root{font-family:inherit;color:inherit;line-height:1.5}" +
      ".oh-controls{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}" +
      ".oh-input,.oh-select{padding:8px 10px;border:1px solid #d4d4d8;border-radius:8px;font:inherit;flex:1;min-width:140px}" +
      ".oh-list{display:flex;flex-direction:column;gap:10px}" +
      ".oh-card{border:1px solid #e4e4e7;border-radius:12px;padding:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}" +
      ".oh-card h3{margin:0 0 4px;font-size:1.05em}" +
      ".oh-meta{font-size:.85em;opacity:.7}" +
      ".oh-btn{padding:8px 14px;border:0;border-radius:8px;background:#111827;color:#fff;cursor:pointer;font:inherit;text-decoration:none;white-space:nowrap}" +
      ".oh-btn.secondary{background:#f4f4f5;color:#111827}" +
      ".oh-field{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}" +
      ".oh-field label{font-size:.85em;font-weight:600}" +
      ".oh-empty,.oh-error{padding:16px;opacity:.7}" +
      ".oh-back{background:none;border:0;cursor:pointer;font:inherit;color:#2563eb;padding:0;margin-bottom:12px}" +
      ".oh-note{font-size:.85em;opacity:.7;margin-top:8px}";
    var style = el("style");
    style.id = "oh-widget-styles";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  var ALLOWED_RESUME = {
    "application/pdf": 1,
    "application/msword": 1,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 1
  };

  function render(container, jobs) {
    container.innerHTML = "";
    var root = el("div", "oh-root");

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
        btn.onclick = function () { openApply(container, jobs, job); };
        card.appendChild(info);
        card.appendChild(btn);
        list.appendChild(card);
      });
    }
    search.oninput = draw;
    deptSelect.onchange = draw;
    draw();
  }

  function field(labelText, input) {
    var wrap = el("div", "oh-field");
    var label = el("label", null, labelText);
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  function openApply(container, jobs, job) {
    container.innerHTML = "";
    var root = el("div", "oh-root");
    var back = el("button", "oh-back", "← Back to all jobs");
    back.onclick = function () { render(container, jobs); };
    root.appendChild(back);
    root.appendChild(el("h3", null, "Apply , " + job.title));

    var form = el("form");
    var first = el("input", "oh-input"); first.required = true;
    var last = el("input", "oh-input"); last.required = true;
    var email = el("input", "oh-input"); email.type = "email"; email.required = true;
    var phone = el("input", "oh-input");
    form.appendChild(field("First name", first));
    form.appendChild(field("Last name", last));
    form.appendChild(field("Email", email));
    form.appendChild(field("Phone", phone));

    var resume = el("input", "oh-input");
    resume.type = "file";
    resume.accept = ".pdf,.doc,.docx";
    form.appendChild(field("Resume", resume));

    var questionInputs = [];
    fetch(api("/api/public/v1/jobs/" + encodeURIComponent(job.slug)))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var cfg = body && body.data && body.data.applicationConfig;
        var questions = (cfg && cfg.questions) || [];
        questions.forEach(function (qn) {
          var input = qn.type === "textarea" ? el("textarea", "oh-input") : el("input", "oh-input");
          if (qn.type === "url") input.type = "url";
          if (qn.required) input.required = true;
          questionInputs.push({ id: qn.id, input: input });
          form.insertBefore(field(qn.label + (qn.required ? " *" : ""), input), submitWrap);
        });
      })
      .catch(function () {});

    var submitWrap = el("div");
    var submit = el("button", "oh-btn", "Submit application");
    submit.type = "submit";
    submitWrap.appendChild(submit);
    var hosted = el("a", "oh-btn secondary", "Open hosted form");
    hosted.href = job.hostedApplyUrl;
    hosted.target = "_blank";
    hosted.style.marginLeft = "8px";
    submitWrap.appendChild(hosted);
    form.appendChild(submitWrap);

    var status = el("div", "oh-note");
    form.appendChild(status);

    form.onsubmit = function (e) {
      e.preventDefault();
      submit.disabled = true;
      status.textContent = "Submitting…";
      var answers = {};
      questionInputs.forEach(function (q) { answers[q.id] = q.input.value; });
      var payload = {
        firstName: first.value, lastName: last.value, email: email.value,
        phone: phone.value, questionAnswers: answers
      };

      uploadResume(resume.files && resume.files[0]).then(function (resumeFields) {
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
    container.appendChild(el("div", "oh-empty", "Loading open roles…"));
    if (!workspace && !pk) {
      container.innerHTML = "";
      container.appendChild(el("div", "oh-error", "Harly widget: set data-workspace or data-pk."));
      return;
    }
    fetch(api("/api/public/v1/jobs"))
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var jobs = (body && body.data && body.data.jobs) || [];
        render(container, jobs);
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
