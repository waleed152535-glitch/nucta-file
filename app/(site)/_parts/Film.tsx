"use client";

/**
 * The home page's opening: a company's return coming together, told in four
 * chapters as you scroll. On a large screen with motion allowed, one stage
 * stays in view and the documents move; otherwise each chapter shows a still
 * picture of its moment, and nothing moves (see site.css).
 */
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ACTORS, CHAPTER_AT, NUMERIC_ROWS, CT_ROWS, SEARCH, SIZES, STILLS, WORLD, frameAt, money, poseCss, type ActorName, type Frame } from "./film-model";
import { Accounts, Approval, CompaniesHouse, Computation, Ct600, Receipt } from "./Docs";
import CompanySearch from "./CompanySearch";
import { PRICES, gbp } from "@/lib/site";

const LIVE = "(min-width: 900px) and (prefers-reduced-motion: no-preference)";

function Actor({ name, f }: { name: ActorName; f: Frame }) {
  const q = f.actors[name];
  const body: Record<ActorName, ReactNode> = {
    accounts: <Accounts />, computation: <Computation />, ct600: <Ct600 f={f} />, approval: <Approval f={f} />,
    ch: <CompaniesHouse f={f} />, receipt: <Receipt />,
  };
  const paper = name !== "ch" && name !== "receipt";
  return (
    <div className="actor" data-actor={name} style={{ width: SIZES[name].w, height: SIZES[name].h, transform: poseCss(name, q), opacity: q.o, borderRadius: paper ? 5 : 18 }}>
      {body[name]}
      {paper && <div className="shade" style={{ opacity: q.d }} />}
    </div>
  );
}

function Stage({ f }: { f: Frame }) {
  return (
    <div className="stage" aria-hidden>
      <div className="light" />
      <div className="floor" />
      <canvas className="dust" />
      <div className="view">
        <div className="world" data-scene={f.scene}>
          <div className="tilt">
            {ACTORS.map((a) => <Actor key={a} name={a} f={f} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dust in the light: slow, drifting, nearer specks larger and faster. */
function dust(canvas: HTMLCanvasElement, count: number) {
  const ctx = canvas.getContext("2d");
  const motes = Array.from({ length: count }, (_, i) => ({
    x: Math.random(), y: Math.random(), z: 0.25 + Math.random() * 0.75,
    vx: (Math.random() - 0.5) * 0.00004, vy: -0.00002 - Math.random() * 0.00005, warm: i % 3 !== 0, tw: Math.random() * 6.28,
  }));
  let w = 0, h = 0, dpr = 1;
  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr);
  };
  size();
  const draw = (t: number, p: number, dt: number) => {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.x = (m.x + m.vx * dt * m.z + 1) % 1; m.y = (m.y + m.vy * dt * m.z + 1) % 1;
      const y = ((m.y - p * 0.35 * m.z) % 1 + 1) % 1;
      const a = (0.18 + 0.5 * m.z) * (0.6 + 0.4 * Math.sin(t * 0.0012 + m.tw));
      ctx.fillStyle = m.warm ? `rgba(255,150,120,${a * 0.55})` : `rgba(170,195,255,${a * 0.45})`;
      ctx.beginPath(); ctx.arc(m.x * w, y * h, 0.5 + m.z * 1.5, 0, 6.283); ctx.fill();
    }
  };
  return { size, draw };
}

/** Writes one frame onto a rendered stage. */
function paint(root: HTMLElement, f: Frame, extra: { t: number; float: number; tilt: [number, number] }, cache: Map<Element, Record<string, string>>) {
  // Only touch a style when it changes: most frames, most things stand still.
  const set = (el: Element | null, key: string, value: string) => {
    if (!el) return;
    let c = cache.get(el);
    if (!c) { c = {}; cache.set(el, c); }
    if (c[key] === value) return;
    c[key] = value;
    (el as HTMLElement).style.setProperty(key, value);
  };
  ACTORS.forEach((name, i) => {
    const el = root.querySelector(`[data-actor="${name}"]`);
    if (!el) return;
    const q = { ...f.actors[name] };
    const paper = name !== "ch" && name !== "receipt";
    if (paper) {
      q.y += Math.sin(extra.t * 0.0006 + i * 1.7) * (2 + 5 * extra.float);
      q.rz += Math.sin(extra.t * 0.0004 + i * 2.3) * (0.15 + 0.5 * extra.float);
    }
    set(el, "transform", poseCss(name, q));
    set(el, "opacity", q.o.toFixed(3));
    set(el, "visibility", q.o < 0.005 ? "hidden" : "visible");
    if (paper) set(el.querySelector(".shade"), "opacity", q.d.toFixed(3));
  });
  const tilt = root.querySelector(".tilt");
  set(tilt, "transform", `rotateX(${extra.tilt[0].toFixed(2)}deg) rotateY(${extra.tilt[1].toFixed(2)}deg)`);
  const world = root.querySelector(".world") as HTMLElement | null;
  if (world && world.dataset.scene !== String(f.scene)) world.dataset.scene = String(f.scene);
  NUMERIC_ROWS.forEach((row, n) => {
    const el = root.querySelector(`[data-amt="${n}"]`);
    const r = CT_ROWS[row];
    const text = money((r.v ?? 0) * f.fills[n], r.pence);
    if (el && el.textContent !== text) el.textContent = text;
  });
  const typed = root.querySelector("[data-typed]");
  const t = SEARCH.slice(0, f.typed);
  if (typed && typed.textContent !== t) typed.textContent = t;
  set(root.querySelector("[data-hit]"), "opacity", f.hit.toFixed(3));
  f.chRows.forEach((o, n) => root.querySelectorAll(`[data-chrow="${n}"] > *`).forEach((el) => set(el, "opacity", o.toFixed(3))));
  set(root.querySelector("[data-sig]"), "stroke-dashoffset", (1 - f.sign).toFixed(3));
  set(root.querySelector("[data-seal]"), "opacity", f.seal.o.toFixed(3));
  set(root.querySelector("[data-seal]"), "transform", `scale(${f.seal.s.toFixed(3)}) rotate(-12deg)`);
}

/** A still picture of one moment, framed for a narrow column. */
function Still({ at }: { at: number }) {
  const s = STILLS[at];
  const f = frameAt(s.p);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const world = box.querySelector(".world") as HTMLElement;
    const view = box.querySelector(".view") as HTMLElement;
    const canvas = box.querySelector("canvas") as HTMLCanvasElement;
    const d = dust(canvas, 40);
    const fit = () => {
      const w = box.clientWidth, h = box.clientHeight;
      const k = w / s.w;
      const ox = w / 2 - s.cx * k, oy = h / 2 - s.cy * k;
      world.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
      view.style.perspective = `${WORLD.depth * k}px`;
      view.style.perspectiveOrigin = `${ox + WORLD.focus.x * k}px ${oy + WORLD.focus.y * k}px`;
      world.classList.add("ready");
      d.size(); d.draw(0, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [s]);
  return <div className="still" ref={ref} data-scene={f.scene}><Stage f={f} /></div>;
}

const STEPS = ["Add the company", "Enter the figures", "Check the documents", "File with HMRC"];

export default function Film({ charging = false }: { charging?: boolean }) {
  const film = useRef<HTMLElement>(null);
  const first = frameAt(0);

  useEffect(() => {
    const section = film.current;
    if (!section) return;
    const mq = window.matchMedia(LIVE);
    const root = section.querySelector(".film-sticky > .stage") as HTMLElement;
    const world = root.querySelector(".world") as HTMLElement;
    const view = root.querySelector(".view") as HTMLElement;
    const scenes = Array.from(section.querySelectorAll<HTMLElement>(".film-copy .scene"));
    const rail = Array.from(section.querySelectorAll<HTMLButtonElement>(".rail button"));
    const d = dust(root.querySelector("canvas") as HTMLCanvasElement, 140);
    const cache = new Map<Element, Record<string, string>>();
    let raf = 0, cur = 0, last = 0, visible = true, H = window.innerHeight;
    const mouse = { x: 0.5, y: 0.5 }, tilt: [number, number] = [0, 0];

    const measure = () => {
      const W = window.innerWidth; H = window.innerHeight;
      const k = Math.min(W / WORLD.w, H / WORLD.h);
      const ox = (W - WORLD.w * k) / 2 + Math.max(0, W - 1240) * 0.04, oy = (H - WORLD.h * k) / 2;
      world.style.transform = `translate(${ox}px,${oy}px) scale(${k})`;
      view.style.perspective = `${WORLD.depth * k}px`;
      view.style.perspectiveOrigin = `${ox + WORLD.focus.x * k}px ${oy + WORLD.focus.y * k}px`;
      d.size();
    };
    const target = () => {
      const r = section.getBoundingClientRect();
      return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - H)));
    };
    const tick = (t: number) => {
      raf = 0;
      if (!mq.matches || !visible) return;
      const dt = last ? Math.min(64, t - last) : 16; last = t;
      const goal = target();
      cur += (goal - cur) * Math.min(1, dt / 120);
      if (Math.abs(goal - cur) < 0.0004) cur = goal;
      const f = frameAt(cur);
      tilt[0] += ((mouse.y - 0.5) * -4 - tilt[0]) * 0.05;
      tilt[1] += ((mouse.x - 0.5) * 7 - tilt[1]) * 0.05;
      paint(root, f, { t, float: f.copy[0].o, tilt }, cache);
      d.draw(t, cur, dt);
      scenes.forEach((el, i) => {
        const c = f.copy[i];
        el.style.opacity = c.o.toFixed(3);
        el.style.transform = `translateY(calc(-46% + ${c.y.toFixed(1)}px))`;
        el.style.visibility = c.o < 0.01 ? "hidden" : "visible";
      });
      rail.forEach((b, i) => {
        b.style.setProperty("--f", `${(f.rail.fill[i] * 100).toFixed(1)}%`);
        if (f.rail.current === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && mq.matches && visible) { last = 0; raf = requestAnimationFrame(tick); } };
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }, { rootMargin: "100px" });
    io.observe(section);
    const onMove = (e: PointerEvent) => { mouse.x = e.clientX / window.innerWidth; mouse.y = e.clientY / window.innerHeight; };
    const onResize = () => { measure(); start(); };
    const onMq = () => { if (mq.matches) { measure(); start(); } else { scenes.forEach((el) => { el.style.cssText = ""; }); } };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    mq.addEventListener("change", onMq);
    if (mq.matches) { measure(); cur = target(); start(); }
    return () => {
      cancelAnimationFrame(raf); io.disconnect();
      window.removeEventListener("pointermove", onMove); window.removeEventListener("resize", onResize); mq.removeEventListener("change", onMq);
    };
  }, []);

  /** Jump to a chapter: on the moving stage, to its point in the scroll; otherwise to the chapter itself. */
  const go = (i: number) => (e: React.MouseEvent) => {
    const section = film.current;
    if (!section || !window.matchMedia(LIVE).matches) return;
    e.preventDefault();
    const top = section.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + CHAPTER_AT[i] * (section.offsetHeight - window.innerHeight), behavior: "smooth" });
  };

  return (
    <section className="film" ref={film} aria-label="How a return comes together">
      <div className="film-sticky">
        <Stage f={first} />
        <div className="film-copy">
          <div className="wrap">
            <div className="scene opening">
              <h1>Every figure in the right box.</h1>
              <p className="price-line">
                {charging
                  ? <><b>{gbp(PRICES.company.perReturn)} a return,</b> or {gbp(PRICES.company.dormant)} for a dormant company. No subscription.</>
                  : <><b>Free while we launch,</b> then {gbp(PRICES.company.perReturn)} a return, or {gbp(PRICES.company.dormant)} for a dormant company. No subscription.</>}
              </p>
              <p className="lede">Nucta File prepares a small company&apos;s accounts, works out its Corporation Tax and files the CT600 with HMRC, with the accounts and computation attached in iXBRL.</p>
              <CompanySearch id="hero-q" />
              <p className="hero-more">
                <Link href="/sign-up">Create your account</Link>
                <a href="#how" onClick={go(0)}>See how it works</a>
              </p>
              <p className="status">Filing live with HMRC since October 2026</p>
              <Still at={0} />
            </div>
            <div className="scene" id="how">
              <span className="n">1 of 4</span>
              <h2>Add the company</h2>
              <p className="lede">Search Companies House by name or number. The registered office, year end and every deadline fill themselves in.</p>
              <Still at={1} />
            </div>
            <div className="scene">
              <span className="n">2 of 4</span>
              <h2>Enter the year&apos;s figures</h2>
              <p className="lede">Profit and loss, equipment bought and sold, director&apos;s loans and the balance sheet. The tax works itself out as you type, box by box.</p>
              <Still at={2} />
            </div>
            <div className="scene">
              <span className="n">3 of 4</span>
              <h2>Check every document</h2>
              <p className="lede">Micro-entity accounts and the tax computation, tagged in iXBRL, the CT600 itself, and an approval pack for the director to sign.</p>
              <Still at={3} />
            </div>
            <div className="scene">
              <span className="n">4 of 4</span>
              <h2>File with HMRC</h2>
              <p className="lede">Filed with your own HMRC sign-in, used once and never stored. HMRC&apos;s receipt is kept with the return, for good.</p>
              <Still at={4} />
            </div>
          </div>
        </div>
        <nav className="rail" aria-label="Chapters">
          <div className="wrap">
            <ol>
              {STEPS.map((s, i) => <li key={s}><button type="button" onClick={go(i)}><i />{i + 1}. {s}</button></li>)}
            </ol>
          </div>
        </nav>
      </div>
    </section>
  );
}
