/* =========================================================================
   Lax-á — "Vaktin"
   Vanilla JS. Every motion device documented in DESIGN.md with exact constants.
   ========================================================================= */
(function () {
  "use strict";

  function boot() {
  var root = document.documentElement;
  var isSmooth = root.classList.contains("is-smooth");
  var reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var clamp = function (v, min, max) { return Math.max(min, Math.min(max, v)); };

  if (window.gsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* =======================================================================
     1. LENIS — desktop only. lerp 0.1. HARD RULE: never on touch/mobile.
     ======================================================================= */
  var lenis = null;
  if (isSmooth && window.Lenis) {
    lenis = new Lenis({
      duration: 1.05,
      lerp: 0.1,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
      smoothWheel: true,
      syncTouch: false
    });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  function currentScroll() {
    return lenis ? lenis.scroll : (window.scrollY || document.documentElement.scrollTop);
  }

  /* =======================================================================
     2. SPLIT-TEXT REVEAL ENGINE (recipes 1 + 2 from DESIGN.md)
     ======================================================================= */
  function splitTitle(el) {
    var text = el.textContent;
    el.textContent = "";
    var line = document.createElement("span");
    line.className = "line";
    var inner = document.createElement("span");
    inner.className = "line-inner";
    line.appendChild(inner);
    var parts = text.split(/(\s+)/);
    var charIndex = 0;
    parts.forEach(function (part) {
      if (part === "") return;
      if (/^\s+$/.test(part)) {
        inner.appendChild(document.createTextNode(part));
        return;
      }
      // word wrapper: chars stay char-revealed, but lines can only break
      // BETWEEN words — never mid-word (375px overflow fix)
      var word = document.createElement("span");
      word.className = "wordwrap";
      Array.prototype.forEach.call(part, function (ch) {
        var span = document.createElement("span");
        span.className = "char";
        span.textContent = ch;
        span.style.transitionDelay = (charIndex * 20) + "ms";
        word.appendChild(span);
        charIndex++;
      });
      inner.appendChild(word);
    });
    el.appendChild(line);
  }

  function splitWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var n;
    while ((n = walker.nextNode())) nodes.push(n);
    var wordIndex = 0;
    nodes.forEach(function (node) {
      if (!node.textContent.trim()) return;
      var parts = node.textContent.split(/(\s+)/);
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part === "") return;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
        } else {
          var span = document.createElement("span");
          span.className = "word";
          span.textContent = part;
          // capped stagger: keeps long paragraphs from producing a runaway cascade
          span.style.transitionDelay = (Math.min(wordIndex, 15) * 40) + "ms";
          wordIndex++;
          frag.appendChild(span);
        }
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  document.querySelectorAll(".rv-title").forEach(splitTitle);
  document.querySelectorAll(".rv-text").forEach(splitWords);

  /* =======================================================================
     3. REVEAL OBSERVERS (recipes 1, 2, 4) + image decode-then-fade (recipe 3)
     ======================================================================= */
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        revealIO.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.35 });
  document.querySelectorAll(".rv-title, .rv-text, .rv-circle").forEach(function (el) {
    revealIO.observe(el);
  });

  /* Safety net: reveals must never permanently hide content. If a tab is
     backgrounded before IntersectionObserver gets a chance to fire (or any
     other timing edge case), force everything visible after 2.5s regardless. */
  setTimeout(function () {
    document.querySelectorAll(".rv-title:not(.is-in), .rv-text:not(.is-in), .rv-circle:not(.is-in), .rv-img:not(.is-in)")
      .forEach(function (el) { el.classList.add("is-in"); });
  }, 2500);

  var imgIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var img = entry.target;
      var show = function () { img.classList.add("is-in"); };
      if (img.complete && img.naturalWidth > 0) {
        requestAnimationFrame(show);
      } else if (img.decode) {
        img.decode().then(show).catch(show);
      } else {
        img.addEventListener("load", show, { once: true });
      }
      imgIO.unobserve(img);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.05 });
  document.querySelectorAll(".rv-img").forEach(function (img) { imgIO.observe(img); });

  /* =======================================================================
     4. NAV — solidify + hide on scroll-down (Lenis direction), mobile menu
     ======================================================================= */
  var nav = document.getElementById("site-nav");
  var lastY = currentScroll();
  var navHideThreshold = 120;
  function onScrollNav(y) {
    var dir = y > lastY ? "down" : "up";
    if (y > navHideThreshold && dir === "down") nav.classList.add("is-hidden");
    else nav.classList.remove("is-hidden");
    lastY = y;
  }
  if (lenis) {
    lenis.on("scroll", function (e) { onScrollNav(e.scroll); });
  } else {
    window.addEventListener("scroll", function () { onScrollNav(currentScroll()); }, { passive: true });
  }

  var burger = document.getElementById("burger");
  var mobileMenu = document.getElementById("mobile-menu");
  function closeMenu() {
    burger.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    mobileMenu.classList.remove("is-open");
  }
  burger.addEventListener("click", function () {
    var open = burger.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
    mobileMenu.classList.toggle("is-open", open);
  });
  mobileMenu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });

  /* =======================================================================
     5. Smooth anchor navigation (desktop, via Lenis; native elsewhere via CSS)
     ======================================================================= */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var navH = nav.offsetHeight;
      if (lenis) {
        lenis.scrollTo(target, { offset: -navH + 8, duration: 1.3, easing: function (t) { return 1 - Math.pow(1 - t, 3); } });
      } else {
        var y = target.getBoundingClientRect().top + currentScroll() - navH + 8;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  });

  /* =======================================================================
     6. PARALLAX — imageMove, 12-13% travel, small moves outside pins
     ======================================================================= */
  if (isSmooth && !reducedMotion) {
    document.querySelectorAll(".parallax").forEach(function (img) {
      gsap.fromTo(img, { yPercent: 0 }, {
        yPercent: -13,
        ease: "none",
        scrollTrigger: { trigger: img, start: "top bottom", end: "bottom top", scrub: true }
      });
    });

    // sectionOutTiny — light -10svh drift on each chapter's head block as it exits
    document.querySelectorAll(".chapter-head, .rivers-head").forEach(function (el) {
      gsap.to(el, {
        y: function () { return -0.1 * window.innerHeight; },
        ease: "none",
        scrollTrigger: { trigger: el, start: "top top", end: "bottom top", scrub: true }
      });
    });
  }

  /* =======================================================================
     7. RIVERS CHAPTER — the main device
     ======================================================================= */
  (function riverChapter() {
    var track = document.getElementById("rivers-track");
    var sticky = track ? track.querySelector(".rivers-sticky") : null;
    var panels = Array.prototype.slice.call(document.querySelectorAll(".beat-panel"));
    var nodes = Array.prototype.slice.call(document.querySelectorAll(".river-node"));
    var flown = document.getElementById("river-flown");
    var staticPath = document.getElementById("river-static");
    var indicator = document.getElementById("river-indicator");
    var rail = document.querySelector(".river-rail");
    var svgEl = document.querySelector(".river-svg");
    var progLabel = document.getElementById("river-progress-label");
    var progFill = document.getElementById("river-progress-fill");
    if (!track || !panels.length) return;
    var N = panels.length;
    var activeIndex = -1;

    function setActive(idx) {
      idx = clamp(idx, 0, N - 1);
      if (idx === activeIndex) return;
      activeIndex = idx;
      panels.forEach(function (p, i) { p.classList.toggle("is-active", i === idx); });
      nodes.forEach(function (nd, i) { nd.classList.toggle("is-active", i === idx); });
      if (progLabel) progLabel.textContent = String(idx + 1).padStart(2, "0") + " / " + N;
      if (progFill) progFill.style.width = (((idx + 1) / N) * 100) + "%";
    }

    /* UN-PINNED (Sindri: customers must never get stuck in a scroll-through
       they don't want to finish). The beats scroll NATIVELY in a column; the
       river map is an ordinary sticky sidebar; the drawn line + indicator
       scrub with chapter progress via a pin-less ScrollTrigger. No wheel
       hijacking, no gravity wells - flick past whenever you like. */
    var panelsWrap = document.querySelector(".beat-panels");
    if (window.ScrollTrigger && staticPath && flown && rail && panelsWrap) {
      var pathLen = staticPath.getTotalLength();
      flown.style.strokeDasharray = String(pathLen);
      flown.style.strokeDashoffset = String(pathLen);

      var vb = svgEl.viewBox.baseVal;
      function placeIndicator(progress) {
        var pt = staticPath.getPointAtLength(clamp(progress, 0, 1) * pathLen);
        var railRect = rail.getBoundingClientRect();
        var scaleX = railRect.width / vb.width;
        var scaleY = railRect.height / vb.height;
        indicator.style.transform =
          "translate(" + (pt.x * scaleX) + "px," + (pt.y * scaleY) + "px) translate(-50%,-50%)";
      }

      var st = ScrollTrigger.create({
        trigger: panelsWrap,
        start: "top 65%",
        end: "bottom 65%",
        scrub: 0.6,
        onUpdate: function (self) {
          var p = self.progress;
          flown.style.strokeDashoffset = String(pathLen * (1 - p));
          placeIndicator(p);
        },
        onRefresh: function (self) { placeIndicator(self.progress); }
      });
      placeIndicator(0);
      window.addEventListener("resize", function () { placeIndicator(st ? st.progress : 0); });
    }

    {
      /* ---- native / mobile: stacked cards, IO-driven active index + progress ---- */
      var panelIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var idx = panels.indexOf(entry.target);
            setActive(idx);
          }
        });
      }, { rootMargin: "-40% 0px -40% 0px", threshold: 0.01 });
      panels.forEach(function (p) { panelIO.observe(p); });
      setActive(0);

      nodes.forEach(function (node, i) {
        node.addEventListener("click", function () {
          panels[i].scrollIntoView({ behavior: "smooth", block: "center" });
        });
      });
    }
  })();

  /* =======================================================================
     8. THREE WORLDS — pinned counter chapter, no WebGL
     ======================================================================= */
  (function worldsChapter() {
    var track = document.getElementById("worlds-track");
    var sticky = track ? track.querySelector(".worlds-sticky") : null;
    var panels = Array.prototype.slice.call(document.querySelectorAll(".world-panel"));
    var navDots = Array.prototype.slice.call(document.querySelectorAll("#worlds-nav button"));
    if (!track || !panels.length) return;
    var N = panels.length;
    var active = 0;

    function setActive(idx) {
      idx = clamp(idx, 0, N - 1);
      if (idx === active && panels[0].classList.contains("is-active") !== undefined && panels[idx].classList.contains("is-active")) {
        // still update dots for safety on first call
      }
      active = idx;
      panels.forEach(function (p, i) { p.classList.toggle("is-active", i === idx); });
      navDots.forEach(function (d, i) { d.classList.toggle("is-active", i === idx); });
    }

    if (isSmooth && window.ScrollTrigger) {
      var st = ScrollTrigger.create({
        trigger: track,
        start: "top top",
        end: "bottom bottom",
        pin: sticky,
        pinSpacing: false,
        scrub: 0.6,
        onUpdate: function (self) { setActive(Math.floor(self.progress * N)); }
      });
      setActive(0);

      navDots.forEach(function (dot, i) {
        dot.addEventListener("click", function () {
          var target = st.start + ((i + 0.5) / N) * (st.end - st.start);
          if (lenis) lenis.scrollTo(target, { duration: 1.1 });
          else window.scrollTo({ top: target, behavior: "smooth" });
        });
      });
    }
    // native mode: CSS already shows every .world-panel stacked (html.is-native rules)
  })();

  /* =======================================================================
     9. ENQUIRY FORM — mailto prefill prototype (no live backend)
     ======================================================================= */
  (function enquiryForm() {
    var form = document.getElementById("enquiry-form");
    var status = document.getElementById("form-status");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var river = form.river.value;
      var week = form.week.value.trim();
      var msg = form.message.value.trim();
      if (!name) { status.textContent = "Nafn vantar."; form.name.focus(); return; }
      if (!email) { status.textContent = "Netfang vantar."; form.email.focus(); return; }
      var subject = "Fyrirspurn um holl — " + river + (week ? " (" + week + ")" : "");
      var bodyLines = [
        "Nafn: " + name,
        "Netfang: " + email,
        "Á: " + river,
        "Vika: " + (week || "ekki tilgreind"),
        "",
        msg || "(engin skilaboð)"
      ];
      var mailto = "mailto:info@lax-a.is?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(bodyLines.join("\n"));
      window.location.href = mailto;
      status.textContent = "Opnar póstforritið þitt með fyrirspurnina útfyllta.";
    });
  })();

  /* =======================================================================
     9b. MOBILE CTA DOCK (JOB 1) — the fixed "Senda fyrirspurn" bar and the
     enquiry form's own submit button are the same CTA. As #enquirySubmitCta
     comes into view the bar retires (translateY+fade, CSS off body.cta-docked);
     scrolling back up brings it home. rootMargin shrunk by the bar's own
     height so "in view" means visible above it, not merely underneath it.
     ======================================================================= */
  (function ctaDock() {
    var bar = document.querySelector(".mobile-cta");
    var target = document.getElementById("enquirySubmitCta");
    if (!bar || !target || !("IntersectionObserver" in window)) return;
    var barH = bar.getBoundingClientRect().height || 68;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        document.body.classList.toggle("cta-docked", e.isIntersecting);
      });
    }, { rootMargin: "0px 0px -" + Math.ceil(barH) + "px 0px", threshold: 0 });
    io.observe(target);
  })();

  /* =======================================================================
     10. Refresh ScrollTrigger once fonts + images have settled
     ======================================================================= */
  if (window.ScrollTrigger) {
    window.addEventListener("load", function () {
      ScrollTrigger.refresh();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  }

  /* Boot only after the mode decision (deferred in the inline gate when the
     viewport loads at width 0). Until boot, everything rests in its natural
     visible state. */
  var de = document.documentElement;
  if (de.classList.contains("is-smooth") || de.classList.contains("is-native")) boot();
  else window.addEventListener("laxa:mode", boot, { once: true });
})();
