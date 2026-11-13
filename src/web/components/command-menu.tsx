import { useEffect, useState } from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";

interface Hit { href: string; label: string; sub?: string }

/**
 * ⌘K / "/" palette. Teams and players are read from the site's own /search page
 * (rendered HTML, data-result links) so there is no JSON API (Open Access ToS 5.2).
 */
export function CommandMenu({ pages }: { pages: readonly (readonly [string, string])[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ teams: Hit[]; players: Hit[] }>({ teams: [], players: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits({ teams: [], players: [] }); return; }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        const pick = (kind: string) =>
          [...doc.querySelectorAll<HTMLAnchorElement>(`a[data-result="${kind}"]`)].slice(0, 8).map((a) => ({
            href: a.getAttribute("href") ?? "/", label: a.textContent?.trim() ?? "", sub: a.dataset.sub,
          }));
        setHits({ teams: pick("team"), players: pick("player") });
      } catch { /* aborted */ }
      setLoading(false);
    }, 150);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [query]);

  const go = (href: string) => { setOpen(false); location.href = href; };
  const needle = query.trim().toLowerCase();
  const matchingPages = pages.filter(([, label]) => !needle || label.toLowerCase().includes(needle));

  return (
    <>
      <Button variant="outline" size="sm" className="w-9 justify-start px-2.5 text-muted-foreground sm:w-56" onClick={() => setOpen(true)}>
        <SearchIcon />
        <span className="hidden sm:inline">Search teams, players…</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">/</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search teams, players and pages" shouldFilter={false}>
        <CommandInput placeholder="Search teams, players, pages…" value={query} onValueChange={setQuery} />
        <CommandList>
          <CommandEmpty>{loading ? "Searching…" : "No matches."}</CommandEmpty>
          {hits.teams.length > 0 && (
            <CommandGroup heading="Teams">
              {hits.teams.map((h) => <CommandItem key={h.href} value={h.href} onSelect={go}>{h.label}</CommandItem>)}
            </CommandGroup>
          )}
          {hits.players.length > 0 && (
            <CommandGroup heading="Players">
              {hits.players.map((h) => (
                <CommandItem key={h.href} value={h.href} onSelect={go}>
                  {h.label}{h.sub && <span className="ml-auto text-xs text-muted-foreground">{h.sub}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {matchingPages.length > 0 && (
            <CommandGroup heading="Pages">
              {matchingPages.map(([href, label]) => <CommandItem key={href} value={href} onSelect={go}>{label}</CommandItem>)}
            </CommandGroup>
          )}
          {needle.length >= 2 && (
            <CommandGroup heading="Search">
              <CommandItem value={`/search?q=${encodeURIComponent(query.trim())}`} onSelect={go}>All results for “{query.trim()}”</CommandItem>
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
