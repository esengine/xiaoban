const SENSITIVE_URL = /(login|signin|sign-in|passport|auth|oauth|pay|cashier|checkout|order\/confirm|trade|wxpay|alipay)/i;
const AUTH_WORDS = /登录|登陆|sign in|log in|支付|付款|收银台|结算/;
const SENSITIVE_TEXT = /(验证码|支付密码|输入密码|请输入密码|身份证号|银行卡号|扫码登录|scan to log in)/;

export const PAGE_SCRIPT = `
(function () {
  if (window.__xb) return;
  var SENSITIVE_URL = new RegExp(${JSON.stringify(SENSITIVE_URL.source)}, 'i');
  var SENSITIVE_TEXT = new RegExp(${JSON.stringify(SENSITIVE_TEXT.source)});
  var AUTH_WORDS = new RegExp(${JSON.stringify(AUTH_WORDS.source)}, 'i');
  var MAX = 60;
  function visible(el) {
    var box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return false;
    var style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  }
  function labelOf(el) {
    var text = (el.innerText || '').trim();
    return (
      text ||
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('title') ||
      el.value ||
      el.getAttribute('name') ||
      el.tagName.toLowerCase()
    ).replace(/\\s+/g, ' ').slice(0, 60);
  }
  function roleOf(el) {
    var tag = el.tagName.toLowerCase();
    if (tag === 'input') return el.type === 'password' ? 'password' : (el.type === 'checkbox' || el.type === 'radio' ? el.type : 'input');
    if (tag === 'textarea') return 'input';
    if (tag === 'select') return 'select';
    if (tag === 'a') return 'link';
    return 'button';
  }
  function list() {
    var nodes = document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [onclick]');
    var out = [];
    var count = 0;
    for (var i = 0; i < nodes.length && count < MAX; i++) {
      var el = nodes[i];
      if (!visible(el) || el.disabled) continue;
      count++;
      el.setAttribute('data-xb', String(count));
      out.push({ index: count, role: roleOf(el), label: labelOf(el) });
    }
    return out;
  }
  function describe(error) {
    var elements = list();
    var hasPassword = false;
    for (var i = 0; i < elements.length; i++) if (elements[i].role === 'password') hasPassword = true;
    var text = (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim();
    return {
      url: location.href,
      title: document.title || '',
      text: text.slice(0, 8000),
      elements: elements,
      sensitive: hasPassword || (SENSITIVE_URL.test(location.pathname + location.search) && AUTH_WORDS.test(text.slice(0, 600))) || (SENSITIVE_TEXT.test(text.slice(0, 1500)) && AUTH_WORDS.test(text.slice(0, 600))),
      error: error || null
    };
  }
  function find(index) {
    return document.querySelector('[data-xb="' + index + '"]');
  }
  function click(index) {
    var el = find(index);
    if (!el) return 'the element is gone; read the page again';
    el.scrollIntoView({ block: 'center' });
    el.click();
    return null;
  }
  function type(index, text) {
    var el = find(index);
    if (!el) return 'the element is gone; read the page again';
    el.focus();
    var proto = el.tagName.toLowerCase() === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, text); else el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return null;
  }
  window.__xb = {
    read: function () { return describe(null); },
    click: function (index) { var e = click(index); return describe(e); },
    type: function (index, text) { var e = type(index, text); return describe(e); },
    scroll: function (down) { window.scrollBy(0, (down ? 1 : -1) * window.innerHeight * 0.8); return describe(null); }
  };
})();
`;

export function runScript(call: string): string {
  return `(function(){try{var r=${call};window.ReactNativeWebView.postMessage(JSON.stringify({xb:r}));}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({xb:{url:location.href,title:'',text:'',elements:[],sensitive:false,error:String(e&&e.message||e)}}));}true;})();`;
}
