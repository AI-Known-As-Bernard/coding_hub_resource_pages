/* ============================================================
   app.js — builds the homepage from resources.js
   You shouldn't need to edit this file to add resources.
   ============================================================ */

(function () {
  "use strict";

  var input   = document.getElementById("q");
  var chips   = document.getElementById("chips");
  var results = document.getElementById("results");
  var count   = document.getElementById("count");

  var activeCategory = "all";
  var query = "";

  /* ---- Site text -------------------------------------------- */

  document.getElementById("site-name").textContent = SITE.name;
  document.title = SITE.name;
  document.getElementById("site-tagline").textContent = SITE.tagline;
  document.getElementById("site-footer").textContent = SITE.footer;
  document.getElementById("site-updated").textContent = SITE.updated;

  /* ---- Helpers ---------------------------------------------- */

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Escapes first, then wraps matches of the current query in <mark>.
  function highlight(text) {
    var safe = escapeHtml(text);
    if (!query) return safe;
    var needle = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp("(" + needle + ")", "ig"), "<mark>$1</mark>");
  }

  // Everything a resource can be matched on.
  function haystack(r) {
    return [
      r.title,
      r.desc || "",
      r.url || "",
      (r.tags || []).join(" "),
      categoryFor(r.category).name
    ].join(" ").toLowerCase();
  }

  // Falls back to a visible "Uncategorised" group if an entry's
  // category id doesn't match anything in CATEGORIES — so a typo
  // shows up on the page instead of silently hiding the link.
  function categoryFor(id) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].id === id) return CATEGORIES[i];
    }
    return {
      id: "uncategorised",
      name: "Uncategorised",
      blurb: "These entries have a category that isn't in CATEGORIES yet.",
      color: "#8A83A0"
    };
  }

  /* ---- Filtering -------------------------------------------- */

  function visibleResources() {
    return RESOURCES.filter(function (r) {
      if (!r || !r.title || !r.url) return false;
      var cat = categoryFor(r.category).id;
      if (activeCategory !== "all" && cat !== activeCategory) return false;
      if (query && haystack(r).indexOf(query.toLowerCase()) === -1) return false;
      return true;
    });
  }

  /* ---- Rendering -------------------------------------------- */

  function rowHtml(r) {
    var meta = "";

    if (r.isNew) meta += '<span class="flag">new</span>';
    if (r.time)  meta += '<span class="time">' + escapeHtml(r.time) + "</span>";

    (r.tags || []).slice(0, 3).forEach(function (t) {
      meta += '<span class="tag">' + highlight(t) + "</span>";
    });

    return (
      '<li><a class="row" href="' + escapeHtml(r.url) + '">' +
        '<span class="row-title">' + highlight(r.title) + "</span>" +
        '<span class="row-path">' + escapeHtml(r.url) + "</span>" +
        (r.desc ? '<span class="row-desc">' + highlight(r.desc) + "</span>" : "") +
        (meta ? '<span class="row-meta">' + meta + "</span>" : "") +
      "</a></li>"
    );
  }

  function groupHtml(category, items) {
    return (
      '<section class="group" style="--accent:' + category.color + '">' +
        '<div class="group-head">' +
          '<h2 class="group-name">' + escapeHtml(category.name) + "</h2>" +
          '<span class="group-count">' + items.length + "</span>" +
        "</div>" +
        (category.blurb
          ? '<p class="group-blurb">' + escapeHtml(category.blurb) + "</p>"
          : "") +
        '<ul class="group-list">' + items.map(rowHtml).join("") + "</ul>" +
      "</section>"
    );
  }

  function emptyHtml() {
    return (
      '<div class="empty">' +
        "<p>Nothing here matches <strong>" + escapeHtml(query || "that filter") +
        "</strong>.</p>" +
        "<p>Try a shorter word, or a topic like loops, css, or git.</p>" +
        '<button type="button" id="reset">Show everything</button>' +
      "</div>"
    );
  }

  function render() {
    var shown = visibleResources();
    var html = "";

    // Known categories, in the order set in resources.js.
    CATEGORIES.forEach(function (cat) {
      var items = shown.filter(function (r) {
        return categoryFor(r.category).id === cat.id;
      });
      if (items.length) html += groupHtml(cat, items);
    });

    // Anything with an unrecognised category id.
    var orphans = shown.filter(function (r) {
      return categoryFor(r.category).id === "uncategorised";
    });
    if (orphans.length) html += groupHtml(categoryFor(null), orphans);

    results.innerHTML = html || emptyHtml();

    var reset = document.getElementById("reset");
    if (reset) reset.addEventListener("click", showEverything);

    count.textContent =
      shown.length === RESOURCES.length
        ? RESOURCES.length + " resources"
        : shown.length + " of " + RESOURCES.length + " resources";
  }

  /* ---- Category chips --------------------------------------- */

  function buildChips() {
    var used = {};
    RESOURCES.forEach(function (r) {
      used[categoryFor(r.category).id] = true;
    });

    var list = [{ id: "all", name: "Everything", color: "" }];
    CATEGORIES.forEach(function (c) { if (used[c.id]) list.push(c); });
    if (used.uncategorised) list.push(categoryFor(null));

    chips.innerHTML = list.map(function (c) {
      return (
        '<button type="button" class="chip" data-cat="' + c.id + '" ' +
        'aria-pressed="' + (c.id === activeCategory) + '">' +
        (c.color ? '<span class="chip-dot" style="--dot:' + c.color + '"></span>' : "") +
        escapeHtml(c.name) +
        "</button>"
      );
    }).join("");
  }

  function setCategory(id) {
    activeCategory = id;
    Array.prototype.forEach.call(chips.querySelectorAll(".chip"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.cat === id));
    });
    render();
  }

  function showEverything() {
    query = "";
    input.value = "";
    setCategory("all");
    input.focus();
  }

  /* ---- Events ----------------------------------------------- */

  chips.addEventListener("click", function (e) {
    var btn = e.target.closest(".chip");
    if (btn) setCategory(btn.dataset.cat);
  });

  input.addEventListener("input", function () {
    query = input.value.trim();
    render();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Escape") showEverything();
  });

  // Press "/" anywhere to jump into the search box.
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
      input.select();
    }
  });

  /* ---- Start ------------------------------------------------ */

  // A link like index.html#python opens with that category selected.
  var fromHash = window.location.hash.replace("#", "");
  if (fromHash && CATEGORIES.some(function (c) { return c.id === fromHash; })) {
    activeCategory = fromHash;
  }

  buildChips();
  render();
})();
