(function () {
  var look = window.__xbLook === true;
  var errors = [];
  var clicked = [];
  function push(message) {
    if (errors.length < 20) errors.push(String(message).slice(0, 300));
  }
  window.addEventListener("error", function (event) {
    push((event.message || "error") + (event.lineno ? " @" + event.lineno : ""));
  }, true);
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    push("unhandled: " + ((reason && reason.message) || reason));
  });
  var original = console.error;
  console.error = function () {
    push(Array.prototype.join.call(arguments, " "));
    return original.apply(console, arguments);
  };
  window.alert = function () {};
  window.confirm = function () { return true; };
  window.prompt = function () { return ""; };
  window.open = function () { return null; };
  document.addEventListener("submit", function (event) { event.preventDefault(); }, true);
  document.addEventListener("click", function (event) {
    var link = event.target && event.target.closest && event.target.closest("a[href]");
    if (link) event.preventDefault();
  }, true);
  function label(element) {
    return (element.innerText || element.value || element.getAttribute("aria-label") || element.tagName)
      .trim()
      .slice(0, 40);
  }

  // ---- does anything move? A few cheap samples of where things are, no pictures.
  var SAMPLES = 4;
  var GAP = 400;
  function half(value) {
    return Math.round(value * 2) / 2;
  }
  function canvasSignature(canvas) {
    try {
      if (canvas.width * canvas.height === 0 || canvas.width * canvas.height > 4000000) return "";
      var small = document.createElement("canvas");
      small.width = 16;
      small.height = 16;
      var context = small.getContext("2d");
      context.drawImage(canvas, 0, 0, 16, 16);
      var data = context.getImageData(0, 0, 16, 16).data;
      var sum = 0;
      for (var i = 0; i < data.length; i += 3) sum = (sum * 31 + data[i]) % 1000003;
      return String(sum);
    } catch (error) {
      return "";
    }
  }
  function describe(element) {
    var name = element.tagName.toLowerCase();
    if (element.id) return name + "#" + element.id;
    var klass = typeof element.className === "string" ? element.className.trim().split(/\s+/)[0] : "";
    return klass ? name + "." + klass : name;
  }
  function fingerprint() {
    var all = document.querySelectorAll("body *");
    var limit = Math.min(all.length, 1500);
    var out = [];
    for (var i = 0; i < limit; i++) {
      var element = all[i];
      var box = element.getBoundingClientRect();
      var style = getComputedStyle(element);
      var own = element.children.length === 0 ? (element.textContent || "").slice(0, 30) : "";
      out.push(
        half(box.left) + "," + half(box.top) + "," + half(box.width) + "," + half(box.height) +
          "|" + style.transform + "|" + style.opacity + "|" + style.backgroundColor + "|" + own +
          "|" + (element.tagName === "CANVAS" ? canvasSignature(element) : "")
      );
    }
    return { prints: out, elements: all, limit: limit };
  }
  function motion(callback) {
    // A browser that is not showing the page (hidden, off screen) makes no frames, and then nothing
    // moves, however much the page animates. Count real frames so "did not move" can be trusted.
    var ticks = 0;
    (function tick() {
      ticks++;
      requestAnimationFrame(tick);
    })();
    var first = fingerprint();
    var changed = {};
    var canvasChanged = false;
    var taken = 1;
    (function sample() {
      if (taken >= SAMPLES) {
        var names = [];
        var count = 0;
        for (var key in changed) {
          count++;
          var name = describe(first.elements[key]);
          if (names.indexOf(name) < 0 && names.length < 6) names.push(name);
        }
        var animations = 0;
        try {
          animations = (document.getAnimations ? document.getAnimations() : []).filter(function (animation) {
            return animation.playState === "running";
          }).length;
        } catch (error) {}
        var observable = ticks >= 4;
        callback({
          observable: observable,
          // Seeing something change proves it moves; seeing nothing only means "still" if frames ran.
          moving: count > 0 || canvasChanged ? true : observable ? false : null,
          changed: count,
          examples: names,
          canvasChanged: canvasChanged,
          animations: animations,
          smil: document.querySelectorAll("animate, animateTransform, animateMotion, set").length
        });
        return;
      }
      setTimeout(function () {
        var next = fingerprint();
        for (var i = 0; i < first.limit && i < next.limit; i++) {
          if (first.prints[i] !== next.prints[i]) {
            changed[i] = true;
            if (first.elements[i].tagName === "CANVAS") canvasChanged = true;
          }
        }
        taken++;
        sample();
      }, GAP);
    })();
  }

  // ---- a contact sheet: the page a few times over a couple of seconds, small, in one picture.
  var FRAMES = 6;
  var COLUMNS = 3;
  var FRAME_WIDTH = 360;
  var FRAME_GAP = 350;
  function styleText(style) {
    var text = "";
    for (var i = 0; i < style.length; i++) text += style[i] + ":" + style.getPropertyValue(style[i]) + ";";
    return text;
  }
  function snapshot() {
    return new Promise(function (resolve, reject) {
      try {
        var width = Math.max(window.innerWidth, 200);
        // Only as tall as the content, so a short page does not spend its pixels on blank space.
        var bottom = 0;
        var boxes = document.body.querySelectorAll("*");
        for (var k = 0; k < boxes.length && k < 1500; k++) {
          var rect = boxes[k].getBoundingClientRect();
          if (rect.height > 0 && rect.bottom > bottom) bottom = rect.bottom;
        }
        var height = Math.min(Math.max(Math.ceil(bottom) + 16, 160), 1000);
        var body = document.body;
        var live = [body].concat(Array.prototype.slice.call(body.querySelectorAll("*"), 0, 800));
        var clone = body.cloneNode(true);
        var copies = [clone].concat(Array.prototype.slice.call(clone.querySelectorAll("*"), 0, 800));
        for (var i = 0; i < live.length && i < copies.length; i++) {
          copies[i].setAttribute(
            "style",
            styleText(getComputedStyle(live[i])) + "animation:none !important;transition:none !important;"
          );
        }
        var liveCanvases = body.querySelectorAll("canvas");
        var cloneCanvases = clone.querySelectorAll("canvas");
        for (var c = 0; c < liveCanvases.length && c < cloneCanvases.length; c++) {
          try {
            var picture = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
            picture.setAttribute("src", liveCanvases[c].toDataURL());
            picture.setAttribute("style", "display:block;width:" + liveCanvases[c].clientWidth + "px;height:" + liveCanvases[c].clientHeight + "px;");
            cloneCanvases[c].parentNode.replaceChild(picture, cloneCanvases[c]);
          } catch (error) {}
        }
        Array.prototype.slice.call(clone.querySelectorAll("script")).forEach(function (script) {
          script.parentNode.removeChild(script);
        });
        var paper = getComputedStyle(document.documentElement).backgroundColor;
        if (paper === "rgba(0, 0, 0, 0)") paper = getComputedStyle(body).backgroundColor;
        if (paper === "rgba(0, 0, 0, 0)") paper = "#ffffff";
        var wrapper = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
        wrapper.setAttribute("style", "width:" + width + "px;height:" + height + "px;overflow:hidden;background:" + paper + ";");
        wrapper.appendChild(clone);
        var xml = new XMLSerializer().serializeToString(wrapper);
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height +
          '"><foreignObject x="0" y="0" width="100%" height="100%">' + xml + "</foreignObject></svg>";
        var image = new Image();
        var timer = setTimeout(function () { reject(new Error("frame timed out")); }, 4000);
        image.onload = function () {
          clearTimeout(timer);
          var scale = FRAME_WIDTH / width;
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(width * scale);
          canvas.height = Math.round(height * scale);
          var context = canvas.getContext("2d");
          context.fillStyle = paper;
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas);
        };
        image.onerror = function () {
          clearTimeout(timer);
          reject(new Error("frame could not be drawn"));
        };
        image.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      } catch (error) {
        reject(error);
      }
    });
  }
  function sheet(callback) {
    var frames = [];
    var started = Date.now();
    function next() {
      if (frames.length >= FRAMES) {
        try {
          var cell = frames[0].canvas;
          var rows = Math.ceil(frames.length / COLUMNS);
          var out = document.createElement("canvas");
          out.width = cell.width * COLUMNS + (COLUMNS + 1) * 4;
          out.height = (cell.height + 14) * rows + 4;
          var context = out.getContext("2d");
          context.fillStyle = "#888888";
          context.fillRect(0, 0, out.width, out.height);
          context.font = "11px sans-serif";
          frames.forEach(function (frame, index) {
            var x = 4 + (index % COLUMNS) * (cell.width + 4);
            var y = 2 + Math.floor(index / COLUMNS) * (cell.height + 14);
            context.fillStyle = "#ffffff";
            context.fillText((index + 1) + "  t=" + (frame.at / 1000).toFixed(1) + "s", x, y + 10);
            context.drawImage(frame.canvas, x, y + 13);
          });
          callback(out.toDataURL("image/jpeg", 0.72), null);
        } catch (error) {
          callback(null, String(error && error.message || error));
        }
        return;
      }
      snapshot().then(function (canvas) {
        frames.push({ canvas: canvas, at: Date.now() - started });
        setTimeout(next, FRAME_GAP);
      }, function (error) {
        if (frames.length >= 2) {
          FRAMES = frames.length;
          next();
        } else {
          callback(null, String(error && error.message || error));
        }
      });
    }
    next();
  }

  var report = {};
  function finish() {
    var root = document.documentElement;
    report.errors = errors;
    report.clicked = clicked;
    report.overflow = root.scrollWidth > window.innerWidth + 2;
    report.title = document.title || null;
    report.text = (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 400);
    var json = JSON.stringify(report);
    if (window.XiaobanCheck) window.XiaobanCheck.done(json);
    else if (window.parent !== window) window.parent.postMessage({ xbCheck: json }, "*");
  }
  function clickThrough() {
    var elements = Array.prototype.slice
      .call(document.querySelectorAll("button, input[type=button], input[type=submit], [role=button]"))
      .filter(function (element) {
        var box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && !element.disabled;
      })
      .slice(0, 6);
    var index = 0;
    (function next() {
      if (index >= elements.length) {
        setTimeout(finish, 300);
        return;
      }
      var element = elements[index++];
      try {
        element.click();
        clicked.push(label(element));
      } catch (error) {
        push(error && error.message);
      }
      setTimeout(next, 250);
    })();
  }
  function run() {
    motion(function (found) {
      report.motion = found;
      if (!look) {
        clickThrough();
        return;
      }
      sheet(function (picture, failure) {
        if (picture) report.sheet = picture;
        if (failure) report.sheetError = failure;
        clickThrough();
      });
    });
  }
  if (document.readyState === "complete") setTimeout(run, 600);
  else window.addEventListener("load", function () { setTimeout(run, 600); });
})();
