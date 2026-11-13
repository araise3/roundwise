/**
 * Layout audit for Roundwise pages. Paste into the browser console on any page of the running site
 * (local dev or live), then run e.g.:
 *
 *   await layoutAudit(["/", "/matches", "/player/1192?period=all"], [375, 768, 1280])
 *   await layoutAudit(["/matches"], [375], { noJs: true })   // server-rendered HTML before hydration
 *
 * Each page is loaded in an off-screen iframe at each width and checked for:
 *   - the page or a table scrolling sideways
 *   - text in compact UI (table cells, numbers, badges, buttons, titles) wrapping onto a second line
 *   - truncated text, and elements spilling out of their card
 * Prose cells (long definitions) are allowed to wrap. Pages are cache-busted (HTML is cached for 5 min).
 */
window.layoutAudit = async (urls, widths, opts = {}) => {
  const out = [];
  const bust = Date.now();
  for (const w of widths) for (const url of urls) {
    const u = url + (url.includes("?") ? "&" : "?") + "_=" + bust;
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-5000px;top:0;width:${w}px;height:900px;border:0`;
    if (opts.noJs) f.sandbox = "allow-same-origin";
    document.body.appendChild(f);
    await new Promise((r) => { f.onload = r; f.src = u; });
    await new Promise((r) => setTimeout(r, 600));
    const d = f.contentDocument, win = f.contentWindow, issues = [];
    const where = (el) => el.closest("[data-slot=card]")?.querySelector("[data-slot=card-title]")?.textContent?.trim()
      ?? el.closest("header,nav,footer")?.tagName ?? "";
    if (d.documentElement.scrollWidth > w + 1) issues.push(`page overflows to ${d.documentElement.scrollWidth}px`);
    for (const tc of d.querySelectorAll("[data-slot=table-container]")) {
      if (tc.scrollWidth > tc.clientWidth + 1) issues.push(`table scrolls sideways [${where(tc)}] ${tc.scrollWidth}>${tc.clientWidth}`);
    }
    const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const t = n.textContent.trim();
      const el = n.parentElement;
      if (!t || !el || el.closest("script,style,svg,p,[data-slot=card-description]")) continue;
      const td = el.closest("td");
      if (td && win.getComputedStyle(td).whiteSpace === "normal" && t.length > 25) continue; // prose
      if (!el.closest("th,td,.tabular-nums,.font-mono,button,a[data-slot=button],[data-slot=badge],li,h1,h2,h3,[data-slot=card-title]")) continue;
      const r = d.createRange();
      r.selectNodeContents(n);
      const tops = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
      if (tops.size > 1) issues.push(`wraps [${where(el)}] "${t.slice(0, 40)}"`);
    }
    for (const el of d.querySelectorAll(".truncate")) {
      if (el.scrollWidth > el.clientWidth + 1) issues.push(`truncated [${where(el)}] "${el.textContent.trim().slice(0, 40)}"`);
    }
    for (const card of d.querySelectorAll("[data-slot=card]")) {
      const cr = card.getBoundingClientRect();
      for (const el of card.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > cr.right + 1 && !el.closest("[data-slot=table-container], .overflow-x-auto, .overflow-auto")) {
          issues.push(`spills out of card [${where(el)}] "${el.textContent.trim().slice(0, 30)}"`);
          break;
        }
      }
    }
    const uniq = [...new Set(issues)];
    out.push(`${w}${opts.noJs ? " (before JS)" : ""} ${url}` + (uniq.length ? "\n  " + uniq.join("\n  ") : " ok"));
    f.remove();
  }
  return out.join("\n");
};
