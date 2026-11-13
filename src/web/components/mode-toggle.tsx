import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Mode = "light" | "dark" | "system";
const KEY = "theme";

/** Runs inline in <head> before first paint, so the page never flashes the wrong theme. */
export const THEME_SCRIPT =
  `try{var t=localStorage.getItem("${KEY}")}catch(e){}` +
  `document.documentElement.classList.toggle("dark",t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))`;

const systemDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
const apply = (m: Mode) => document.documentElement.classList.toggle("dark", m === "dark" || (m === "system" && systemDark()));

export function ModeToggle() {
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    try { setMode((localStorage.getItem(KEY) as Mode | null) ?? "system"); } catch { /* storage blocked */ }
  }, []);

  // While on "system", follow OS changes live.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [mode]);

  const choose = (v: string) => {
    const m = v as Mode;
    setMode(m);
    apply(m);
    try { m === "system" ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, m); } catch { /* storage blocked */ }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Theme">
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={mode} onValueChange={choose}>
          <DropdownMenuRadioItem value="light"><Sun />Light</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon />Dark</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor />System</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
