(function () {
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
  function finish() {
    var root = document.documentElement;
    var json = JSON.stringify({
      errors: errors,
      clicked: clicked,
      overflow: root.scrollWidth > window.innerWidth + 2,
      title: document.title || null,
      text: (document.body ? document.body.innerText : "").replace(/\s+/g, " ").trim().slice(0, 400)
    });
    if (window.XiaobanCheck) window.XiaobanCheck.done(json);
    else if (window.parent !== window) window.parent.postMessage({ xbCheck: json }, "*");
  }
  function run() {
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
  if (document.readyState === "complete") setTimeout(run, 600);
  else window.addEventListener("load", function () { setTimeout(run, 600); });
})();
