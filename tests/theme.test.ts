import { readFileSync } from "node:fs";
import { themeFrom, THEMES } from "../lib/theme";

let passed = 0, failed = 0;
const t = (name: string, ok: boolean, got?: unknown) => { if (ok) passed++; else { failed++; console.log("FAIL", name, got === undefined ? "" : JSON.stringify(got)); } };
const eq = (name: string, got: unknown, want: unknown) => t(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

console.log("— the choice");
eq("dark unless asked", themeFrom(undefined), "dark");
eq("light", themeFrom("light"), "light");
eq("match my device", themeFrom("system"), "system");
eq("anything else is dark", themeFrom("purple"), "dark");
eq("three choices in the menu", THEMES.map((x) => x.value), ["dark", "light", "system"]);

console.log("— the stylesheet");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const block = (sel: string) => {
  const i = css.indexOf(sel + "{");
  if (i < 0) return "";
  return css.slice(i + sel.length + 1, css.indexOf("}", i));
};
const props = (b: string) => Object.fromEntries([...b.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const root = props(block(":root"));
const light = props(block('.app[data-theme="light"]'));
const system = props(block('  .app[data-theme="system"]'));
t("the light theme is there", Object.keys(light).length > 30, Object.keys(light).length);
eq("match my device uses exactly the light values", system, light);
const colourish = Object.entries(root).filter(([, v]) => /#|rgba?\(|gradient|blur\(/.test(v)).map(([k]) => k).filter((k) => !["--display", "--sans", "--mono"].includes(k));
const missing = colourish.filter((k) => !(k in light));
eq("every colour has a light value", missing, []);
t("light sets the light colour scheme", /color-scheme:light/.test(block('.app[data-theme="light"]')));
// Hard-coded light-on-dark colours, outside the token blocks, are what break a theme.
const rest = css.replace(/:root\{[\s\S]*?\}/, "").replace(/\.app\[data-theme="light"\]\{[\s\S]*?\}/, "").replace(/@media \(prefers-color-scheme: light\)\{[\s\S]*?\n\}/, "");
const stray = [...rest.matchAll(/rgba\(255,255,255,\.0\d\)|rgba\(0,0,0,\.[12]\d?\)|rgba\(22,33,58|rgba\(12,19,34/g)].map((m) => m[0]);
eq("no fixed dark-theme washes left in the rules", stray, []);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
