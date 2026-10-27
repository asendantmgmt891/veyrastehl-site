// veyrastehl.net -- standalone single-page creator site.
//
// Bot-mitigation design (Edgar, 2026-10-27): the "Premium sites" link must
// not appear as a static href anywhere a crawler (especially Instagram's
// automated Account Status / Links reviewer) can find it, while still
// working for a real human visitor who clicks the button. Three independent
// layers, each catching a different class of automated checker:
//
// 1. No static link at all -- "Premium sites" is a <button>, not an <a>.
//    Nothing in the raw HTML points off-domain. A crawler that only parses
//    HTML (no JS execution) never sees a destination to follow.
// 2. Short-lived signed token -- the click handler asks this Worker for a
//    one-time token (HMAC-SHA256, 60s TTL) at the moment of the real click,
//    then navigates to /premium?t=<token>. /premium rejects any request
//    without a valid, unexpired token. Defeats anything that doesn't
//    actually execute the page's JS to get a fresh token each time.
// 3. Referrer + Cloudflare bot-signal checks -- /premium additionally
//    requires a same-origin Referer and is not a Cloudflare-classified
//    known bot. Belt-and-suspenders on top of the token.
//
// Honest limit (told to Edgar directly): a sophisticated reviewer running a
// real headless browser that executes JS and performs a genuine click would
// pass all three checks, indistinguishable from a real visitor. This stops
// naive/automated link-checking, not a determined human-driven one.
//
// /robots.txt explicitly disallows /premium as an additional (weak, advisory
// -- not all crawlers honor it) signal.

const GALLERY = [
  "/veyra-stehl-yoga-rocks.jpg",
  "/veyra-stehl-profile-side.jpg",
  "/veyra-stehl-yoga-lunge.jpg",
  "/veyra-stehl-blue-studio.jpg",
  "/veyra-stehl-sunlit-portrait.jpg",
  "/veyra-stehl-car-duo.jpg",
  "/veyra-stehl-car-portrait.jpg",
];

// 2026-10-27 (Edgar): no hop through disruptful.org -- her site must be 100%
// standalone. Direct real-platform destinations, same as previously reached
// via disruptful.org/premium/veyra-stehl (that page itself pulled these from
// disruptful-site's functions/_lib/premiumLinks.js).
const OF_URL = "https://onlyfans.com/veyrastehl";
const MYM_URL = "https://mym.fans/Veyrastehl";
const TOKEN_TTL_SECONDS = 60;
// Gates a public marketing link against naive crawlers, not an auth secret --
// safe to keep as a plain source constant rather than a separate Workers
// secret binding (avoids an extra manual dashboard step to deploy).
const PREMIUM_LINK_SECRET = "676f7c68b7b73dbea23a46254265286e2120a64f08738de01977cacd833a887b";

function indexPage() {
  // 2026-10-27 (Edgar): "Premium sites" must feel like disruptful.com's
  // in-place dialog, not a separate webpage. No browser navigation happens
  // here at all now -- clicking the button swaps in a centered white card
  // (same visual language as disruptful.com's .sensitive-page-card) within
  // this same document. Security model is unchanged: the real OF/MYM URLs
  // still only reach the client via a token+referrer+bot-gated fetch
  // (/premium-links) made at the moment of the real "I am over 18" click,
  // never present in this page's static HTML.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#08070b"><meta name="description" content="Veyra Stehl &mdash; Yoga, fitness, and visual inspiration."><title>Veyra Stehl</title><link rel="stylesheet" href="/styles.css"></head>
<body>
  <main>
    <div id="home-content">
      <section class="profile-hero" aria-labelledby="veyra-name">
        <figure class="portrait"><img src="/veyra-stehl.jpg" alt="Veyra Stehl seated in an arched desert setting"></figure>
        <div class="profile-copy"><p class="eyebrow">Digital creator</p><h1 id="veyra-name">Veyra Stehl</h1><h2>Yoga <span>&bull;</span> Fitness <span>&bull;</span> Visual inspiration</h2><p class="lede">Yoga and fitness for visual inspiration &mdash; mainly for men, but all are welcome. Move better, stress less, and build a stronger mind and body.</p>
          <div class="actions">
            <a class="button primary" href="https://www.instagram.com/veyrastehl/" target="_blank" rel="noopener">Instagram &#8599;</a>
            <a class="button primary" href="https://www.tiktok.com/@veyrastehl" target="_blank" rel="noopener">TikTok &#8599;</a>
            <a class="button primary" href="https://x.com/veyrastehl" target="_blank" rel="noopener">X &#8599;</a>
            <button class="button dark" id="premium-btn" type="button">Premium sites &#8599;</button>
          </div>
        </div>
      </section>
      <section class="gallery" aria-label="Veyra Stehl photo gallery">${GALLERY.map((src, i) => `<img src="${src}" alt="Veyra Stehl photo ${i + 1}">`).join("")}</section>
    </div>
    <div id="premium-dialog" class="premium-dialog">
      <div class="premium-card" role="dialog" aria-labelledby="premium-title">
        <div id="age-gate">
          <h1 id="premium-title">Sensitive Content</h1>
          <p>These links may contain content that is not appropriate for all audiences.</p>
          <div class="actions"><button class="button primary" id="age-confirm" type="button">I am over 18</button></div>
        </div>
        <div id="premium-choice" style="display:none">
          <h1>Premium content</h1>
          <p>Choose a site to continue.</p>
          <div class="actions" id="premium-links"></div>
        </div>
        <button class="button ghost" id="premium-back" type="button">Back to Veyra Stehl</button>
      </div>
    </div>
  </main>
  <script>
    function openDialog() {
      document.getElementById('home-content').style.display = 'none';
      document.getElementById('premium-dialog').classList.add('open');
    }
    function resetAndCloseDialog() {
      document.getElementById('premium-dialog').classList.remove('open');
      document.getElementById('home-content').style.display = '';
      document.getElementById('age-gate').style.display = '';
      document.getElementById('premium-choice').style.display = 'none';
      document.getElementById('premium-links').innerHTML = '';
      document.getElementById('age-confirm').disabled = false;
    }
    document.getElementById('premium-btn').addEventListener('click', function () {
      openDialog();
    });
    document.getElementById('premium-back').addEventListener('click', function () {
      resetAndCloseDialog();
    });
    document.getElementById('age-confirm').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      try {
        var tokenRes = await fetch('/premium-token', { method: 'POST' });
        if (!tokenRes.ok) throw new Error('token request failed');
        var tokenData = await tokenRes.json();
        var linksRes = await fetch('/premium-links?t=' + encodeURIComponent(tokenData.token));
        if (!linksRes.ok) throw new Error('links request failed');
        var links = await linksRes.json();
        document.getElementById('premium-links').innerHTML =
          '<a class="button primary" target="_blank" rel="noopener noreferrer" href="' + links.of + '">OnlyFans &#8599;</a>' +
          '<a class="button primary" target="_blank" rel="noopener noreferrer" href="' + links.mym + '">MYM &#8599;</a>';
        document.getElementById('age-gate').style.display = 'none';
        document.getElementById('premium-choice').style.display = '';
      } catch (e) {
        btn.disabled = false;
      }
    });
  </script>
</body></html>`;
}

// ---- token signing (HMAC-SHA256 over "exp", base64url(exp) + "." + base64url(sig)) ----

function base64url(buf) {
  let str = typeof buf === "string" ? buf : String.fromCharCode(...new Uint8Array(buf));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
  );
}

async function signToken(secret, exp) {
  const key = await getHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(exp)));
  return `${exp}.${base64url(sig)}`;
}

async function verifyToken(secret, token) {
  if (!token || !token.includes(".")) return false;
  const [expStr, sigB64] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return false; // expired
  const expected = await signToken(secret, exp);
  // constant-time-ish compare is nice-to-have here but not critical: this
  // token only gates a public marketing link, not an authenticated secret.
  return expected === token;
}

function isKnownBot(request) {
  const cf = request.cf || {};
  // Free-tier Cloudflare still tags well-known crawlers (Googlebot, etc.)
  // via botManagement.verifiedBot even without paid Bot Management scoring.
  if (cf.botManagement && cf.botManagement.verifiedBot) return true;
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  return /bot|spider|crawl|facebookexternalhit|instagram|whatsapp|slackbot|discordbot|telegrambot|preview/i.test(ua);
}

function sameOriginReferer(request, url) {
  const ref = request.headers.get("Referer");
  if (!ref) return false;
  try {
    return new URL(ref).hostname === url.hostname;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /premium\nDisallow: /premium-links\n", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname === "/premium-token" && request.method === "POST") {
      const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
      const token = await signToken(PREMIUM_LINK_SECRET, exp);
      return new Response(JSON.stringify({ token }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/premium") {
      const token = url.searchParams.get("t");
      const tokenOk = await verifyToken(PREMIUM_LINK_SECRET, token);
      if (!tokenOk || !sameOriginReferer(request, url) || isKnownBot(request)) {
        return Response.redirect(`${url.origin}/`, 302);
      }
      return new Response(premiumPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // 2026-10-27 (Edgar): backs the in-place dialog on "/" -- same gating as
    // /premium above (token+referrer+bot), just returns JSON instead of a
    // full page so the homepage can inject the real OF/MYM links without a
    // browser navigation.
    if (url.pathname === "/premium-links") {
      const token = url.searchParams.get("t");
      const tokenOk = await verifyToken(PREMIUM_LINK_SECRET, token);
      if (!tokenOk || !sameOriginReferer(request, url) || isKnownBot(request)) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ of: OF_URL, mym: MYM_URL }), {
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(indexPage(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    // Static assets (images, styles.css) fall through to the Workers Static
    // Assets binding -- preserves whatever asset-serving this Worker already
    // had, unchanged.
    return env.ASSETS.fetch(request);
  },
};
