import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CommandMenu } from "./command-menu";
import { ModeToggle } from "./mode-toggle";

export const NAV = [
  ["/matches", "Matches"],
  ["/teams", "Teams"],
  ["/players", "Players"],
  ["/maps", "Maps"],
  ["/leaderboards", "Leaders"],
  ["/compare", "Compare"],
  ["/about", "About"],
] as const;

const linkCls = (on: boolean) =>
  cn("rounded-md px-2 py-1.5 whitespace-nowrap text-muted-foreground hover:text-foreground", on && "bg-accent text-foreground");

/** Below lg: menu button that opens the nav in a left sheet. */
function MobileNav({ siteName, active }: { siteName: string; active?: string }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="-ml-2 size-8 lg:hidden" aria-label="Open menu"><Menu /></Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader><SheetTitle>{siteName}</SheetTitle></SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-1 px-2 text-sm">
          <a href="/" className={linkCls(!active)}>Overview</a>
          {NAV.map(([href, label]) => (
            <a key={href} href={href} aria-current={active === href ? "page" : undefined} className={linkCls(active === href)}>{label}</a>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function Layout({ siteName, active, children }: { siteName: string; active?: string; children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 lg:gap-6">
            <MobileNav siteName={siteName} active={active} />
            <a href="/" className="font-semibold">{siteName}</a>
            <nav aria-label="Main" className="hidden flex-1 gap-1 text-sm lg:flex">
              {NAV.map(([href, label]) => (
                <a key={href} href={href} aria-current={active === href ? "page" : undefined} className={linkCls(active === href)}>{label}</a>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1">
              <CommandMenu pages={NAV} />
              <ModeToggle />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
        <Attribution siteName={siteName} />
      </div>
    </TooltipProvider>
  );
}

/**
 * Required by the Riot Open Access ToS 9.5 / 9.6 and Riot's Legal Jibber Jabber policy.
 * Logos are GRID's own files from grid.gg/brand/.
 */
function Attribution({ siteName }: { siteName: string }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 text-xs text-muted-foreground md:flex-row md:justify-between">
        <div className="flex items-center gap-2.5 text-foreground">
          <img src="/grid-logo-black.svg" alt="GRID" height={20} className="h-5 w-auto dark:hidden" />
          <img src="/grid-logo-white.svg" alt="GRID" height={20} className="hidden h-5 w-auto dark:block" />
          <strong className="font-medium">Official Riot Esports Data powered by GRID</strong>
        </div>
        <div className="max-w-2xl space-y-1 md:text-right">
          <p>{siteName} and any product on it are not endorsed or sponsored by Riot Games or GRID.</p>
          <p>
            {siteName} was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games.
            Riot Games does not endorse or sponsor this project.
          </p>
          <p>
            Team logos via <a className="underline underline-offset-2 hover:text-foreground" href="https://liquipedia.net/valorant">Liquipedia</a> (CC BY-SA 3.0)
            and GRID; they are trademarks of their teams.
          </p>
          <p>Data is delayed and may contain errors or gaps. Non-commercial fan project.</p>
        </div>
      </div>
    </footer>
  );
}
