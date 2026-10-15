## Integrate the <undefined /> component from React Bits

You are helping integrate an open-source React component into an existing application.

### Component: undefined
### Variant: JavaScript + CSS
### Dependencies: motion @hugeicons/react @hugeicons/core-free-icons

---

### Usage Example
```jsx
import { useRef, useState } from 'react';
import { Attachment01Icon, Globe02Icon } from '@hugeicons/core-free-icons';
import PromptBar from './PromptBar';

const [busy, setBusy] = useState(false);
const controller = useRef(null);

const send = async (text, { attachments, model, effort }) => {
  setBusy(true);
  controller.current = new AbortController();
  await ask({ text, attachments, model: model.key, effort, signal: controller.current.signal }).catch(() => {});
  setBusy(false);
};

<PromptBar
  placeholder="Ask anything"
  sources={[
    { key: 'files', name: 'Photos & files', description: 'Upload from this device', icon: Attachment01Icon, attach: true },
    { key: 'web', name: 'Web search', description: 'Live results', icon: Globe02Icon }
  ]}
  commands={[{ key: 'summarize', name: '/summarize', description: 'Digest the thread so far' }]}
  models={[
    { key: 'nova-3', name: 'Nova 3', tag: 'Flagship' },
    { key: 'nova-mini', name: 'Nova Mini', tag: 'Fast' }
  ]}
  efforts={['Low', 'Medium', 'High', 'Extra', 'Max']}
  busy={busy}
  onSend={send}
  onStop={() => controller.current?.abort()}
  onAttach={() => pickFiles()}
  onDictate={() => transcribe()}
  background="#27272a"
  color="#f5f5f5"
  menuBackground="#323236"
  sparkColor="#b39dff"
  sparkBoost={1}
  width={400}
  radius={16}
  maxRows={5}
  morphDuration={240}
  squash={0.12}
  tilt={8}
  pressScale={0.96}
/>
```

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| placeholder | string | "Ask anything" | Shown while the field is empty. |
| sources | PromptBarSource[] | DEFAULT_SOURCES | Rows of the @ menu and the plus button: key, name, description, icon (a Hugeicons icon or any node), and attach: true for the row that adds files. |
| commands | PromptBarCommand[] | DEFAULT_COMMANDS | Rows of the / menu: key, name (with the slash), description. |
| models | PromptBarModel[] | DEFAULT_MODELS | Rows of the model picker: key, name, tag. An empty list hides the picker. |
| efforts | string[] | DEFAULT_EFFORTS | Steps of the effort slider, low to high. The last step turns the field to the spark colour with drifting sparks. An empty list hides the control. |
| defaultEffort | string | "" | The step selected at first. Empty picks the middle. |
| onEffortChange | (effort) => void | - | The slider moved. |
| defaultModel | string | "" | Key of the model selected at first. Empty picks the first. |
| busy | boolean | false | A response is in flight. The send tile stays ink and its arrow morphs into a stop square. |
| onSend | (text, { attachments, model, effort }) => void | - | Enter or the tile, with a non-empty draft or an attachment. The draft and attachments clear. |
| onStop | () => void | - | The tile while busy. |
| onAttach | () => string | string[] | Promise<string | string[]> | - | Picked the attach row. Return file names, or a promise of them, and they appear as chips. |
| onDictate | () => string | Promise<string> | - | The mic. Return the transcript, or a promise of it, and it lands in the draft. Omit to hide the mic. |
| background | string | "#27272a" | The field surface, and the glyph on an armed tile. |
| color | string | "#f5f5f5" | The ink: text, icons, and the armed tile. |
| menuBackground | string | "#323236" | The surface of the menus and the effort popover. |
| sparkColor | string | "#b39dff" | The wash, the sparks and the slider at the top effort. |
| sparkBoost | number | 1 | How strongly typing drives the sparks at the top effort: they rise faster, grow and glow brighter with typing speed, and flash on each keystroke. No sparks are added. 0 keeps them calm. |
| width | number | 400 | Field width in px, capped at the parent. |
| radius | number | 16 | Field corner radius in px. |
| maxRows | number | 5 | Rows the field grows to before it scrolls. |
| morphDuration | number | 240 | Arrow to square and back, in ms. |
| squash | number | 0.12 | Mid-morph pinch. The glyph narrows by this and grows taller to keep its area. |
| tilt | number | 8 | Mid-morph lean in degrees, mirrored on the way back. |
| pressScale | number | 0.96 | Scale of the send tile while a pointer is down. |
| className | string | "" | Extra classes for the root. |

### Full Component Source
```jsx
'use client';

import { isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  Attachment01Icon,
  Calendar03Icon,
  Cancel01Icon,
  ChartLineData01Icon,
  File02Icon,
  Globe02Icon,
  HelpCircleIcon,
  Mail01Icon,
  Mic01Icon,
  PlusSignIcon,
  SparklesIcon,
  Tick02Icon
} from '@hugeicons/core-free-icons';
import './PromptBar.css';

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const EASE_IN_OUT = [0.77, 0, 0.175, 1];
const LINE = 22;
const EDGE = 11;

const DEFAULT_SOURCES = [
  {
    key: 'files',
    name: 'Photos & files',
    description: 'Upload from this device',
    icon: Attachment01Icon,
    attach: true
  },
  { key: 'web', name: 'Web search', description: 'Live results', icon: Globe02Icon },
  { key: 'sales', name: 'Sales data', description: 'Revenue and churn', icon: ChartLineData01Icon },
  { key: 'docs', name: 'Documents', description: 'Specs, notes, briefs', icon: File02Icon },
  { key: 'mail', name: 'Mail', description: 'Read and draft mail', icon: Mail01Icon },
  { key: 'calendar', name: 'Calendar', description: 'Events and availability', icon: Calendar03Icon }
];
const DEFAULT_COMMANDS = [
  { key: 'summarize', name: '/summarize', description: 'Digest the thread so far' },
  { key: 'compare', name: '/compare', description: 'Two options side by side' },
  { key: 'draft', name: '/draft', description: 'Write a first version' },
  { key: 'explain', name: '/explain', description: 'A plain-language walkthrough' },
  { key: 'tasks', name: '/tasks', description: 'Turn this into a to-do list' }
];
const DEFAULT_MODELS = [
  { key: 'nova-3', name: 'Nova 3', tag: 'Flagship' },
  { key: 'nova-mini', name: 'Nova Mini', tag: 'Fast' },
  { key: 'nova-2', name: 'Nova 2', tag: 'Legacy' }
];
const DEFAULT_EFFORTS = ['Low', 'Medium', 'High', 'Extra', 'Max'];

const mix = (a, b, t) => a + (b - a) * t;
const pathAt = (a, b, t) => {
  let d = '';
  for (let i = 0; i < a.length; i += 2) {
    d += `${i ? 'L' : 'M'}${mix(a[i], b[i], t).toFixed(2)} ${mix(a[i + 1], b[i + 1], t).toFixed(2)}`;
  }
  return `${d}Z`;
};

const parseToken = draft => {
  const m = /(^|\s)([@/])([\w-]*)$/.exec(draft);
  if (!m) return null;
  return { kind: m[2] === '@' ? 'at' : 'slash', query: m[3].toLowerCase(), start: m.index + m[1].length };
};

const renderIcon = (icon, size) =>
  isValidElement(icon) ? icon : <HugeiconsIcon icon={icon} size={size} strokeWidth={1.8} />;

function SendGlyph({ busy, morphDuration, squash, tilt }) {
  const reduce = useReducedMotion();
  const svgRef = useRef(null);
  const pathRef = useRef(null);
  const dir = useRef(busy ? 1 : -1);
  const t = useMotionValue(busy ? 1 : 0);

  useEffect(() => {
    const target = busy ? 1 : 0;
    dir.current = busy ? 1 : -1;
    if (t.get() === target) return undefined;
    const controls = animate(
      t,
      target,
      reduce ? { duration: 0 } : { duration: morphDuration / 1000, ease: EASE_IN_OUT }
    );
    return () => controls.stop();
  }, [busy, morphDuration, reduce, t]);

  useMotionValueEvent(t, 'change', v => {
    pathRef.current?.setAttribute('d', pathAt(ARROW_UP, SQUARE, v));
    const goo = reduce ? 0 : Math.sin(v * Math.PI);
    const sx = 1 - squash * goo;
    if (svgRef.current) {
      svgRef.current.style.transform = goo ? `rotate(${dir.current * tilt * goo}deg) scale(${sx}, ${1 / sx})` : '';
    }
  });

  return (
    <svg
      ref={svgRef}
      className="prompt-bar__glyph"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    >
      <path ref={pathRef} d={pathAt(ARROW_UP, SQUARE, t.get())} />
    </svg>
  );
}

export default function PromptBar({
  placeholder = 'Ask anything',
  sources = DEFAULT_SOURCES,
  commands = DEFAULT_COMMANDS,
  models = DEFAULT_MODELS,
  defaultModel = '',
  efforts = DEFAULT_EFFORTS,
  defaultEffort = '',
  onEffortChange,
  busy = false,
  onSend,
  onStop,
  onAttach,
  onDictate,
  background = '#27272a',
  color = '#f5f5f5',
  menuBackground = '#323236',
  sparkColor = '#b39dff',
  sparkBoost = 1,
  width = 400,
  radius = 16,
  maxRows = 5,
  morphDuration = 240,
  squash = 0.12,
  tilt = 8,
  pressScale = 0.96,
  className = ''
}) {
  const reduce = useReducedMotion();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const glowRef = useRef(null);
  const sparkRef = useRef(null);
  const typing = useRef({ energy: 0, strokes: 0 });
  const boost = useRef(sparkBoost);
  boost.current = sparkBoost;
  const rowRefs = useRef([]);
  const lastOpen = useRef(null);
  const dictation = useRef(0);
  const latest = useRef({});
  latest.current = { onSend, onStop, onAttach, onDictate, onEffortChange };

  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [modelKey, setModelKey] = useState(defaultModel);
  const [plusOpen, setPlusOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const [effortIndex, setEffortIndex] = useState(() => {
    const i = efforts.indexOf(defaultEffort);
    return i >= 0 ? i : Math.max(0, Math.floor((efforts.length - 1) / 2));
  });
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  const [listening, setListening] = useState(false);
  const [pressed, setPressed] = useState(false);

  const model = models.find(m => m.key === modelKey) ?? models[0];
  const token = dismissed ? null : parseToken(draft);
  const open = plusOpen ? 'at' : (token?.kind ?? (modelOpen ? 'model' : effortOpen ? 'effort' : null));
  const query = plusOpen ? '' : (token?.query ?? '');
  const list = useMemo(() => {
    if (open === 'at') return sources.filter(s => s.name.toLowerCase().includes(query));
    if (open === 'slash') return commands.filter(c => c.name.replace(/^\//, '').toLowerCase().startsWith(query));
    if (open === 'model') return models;
    return [];
  }, [open, query, sources, commands, models]);
  const cursor = Math.min(active, Math.max(0, list.length - 1));
  const canSend = draft.trim().length > 0 || attachments.length > 0;
  const armed = busy || canSend;
  const level = efforts[effortIndex] ?? '';
  const maxed = efforts.length > 1 && effortIndex === efforts.length - 1;

  const focusInput = () => inputRef.current?.focus({ preventScroll: true });
  const closeMenus = useCallback(() => {
    setPlusOpen(false);
    setModelOpen(false);
    setEffortOpen(false);
  }, []);

  useLayoutEffect(() => {
    const glow = glowRef.current;
    if (!glow || !open) return;
    const row = rowRefs.current[cursor];
    if (!row) {
      glow.style.opacity = '0';
      return;
    }
    const fresh = lastOpen.current !== open;
    lastOpen.current = open;
    if (fresh) glow.style.transition = 'none';
    glow.style.top = `${row.offsetTop}px`;
    glow.style.height = `${row.offsetHeight}px`;
    glow.style.opacity = '1';
    if (fresh) {
      void glow.offsetHeight;
      glow.style.transition = '';
    }
  }, [open, cursor, list]);
  useEffect(() => {
    if (!open) lastOpen.current = null;
  }, [open]);

  useEffect(() => {
    if (!plusOpen && !modelOpen && !effortOpen) return undefined;
    const onDown = e => {
      if (!rootRef.current?.contains(e.target)) closeMenus();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [plusOpen, modelOpen, effortOpen, closeMenus]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    const max = LINE * maxRows;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [draft, maxRows]);

  useEffect(
    () => () => {
      dictation.current += 1;
    },
    []
  );

  useEffect(() => {
    const canvas = sparkRef.current;
    if (!maxed || reduce || !canvas) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    typing.current.strokes = 0;
    let raf = 0;
    let last = performance.now();
    let w = 0;
    let h = 0;
    let due = 0;
    let speed = 1;
    let pulse = 0;
    const parts = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = burst => {
      parts.push({
        x: Math.random() * w,
        y: burst ? h * (0.2 + Math.random() * 0.8) : h + 3,
        r: 0.9 + Math.random() * 1.1,
        vy: -(7 + Math.random() * 9),
        sway: (Math.random() - 0.5) * 10,
        phase: Math.random() * Math.PI * 2,
        life: burst ? Math.random() * 1.2 : 0,
        span: 2.4 + Math.random() * 2.4
      });
    };
    const tick = now => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const typed = typing.current;
      const gain = boost.current;
      typed.energy *= Math.exp(-dt / 0.8);
      pulse *= Math.exp(-dt / 0.16);
      if (typed.strokes > 0) {
        typed.strokes = 0;
        if (gain > 0) pulse = 1;
      }
      const energy = typed.energy * gain;
      speed += (1 + energy * 6 - speed) * (1 - Math.exp(-dt / 0.15));
      due += dt;
      while (due > 0.14) {
        due -= 0.14;
        if (parts.length < 30) spawn(false);
      }
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = sparkColor;
      ctx.shadowColor = sparkColor;
      ctx.shadowBlur = 6 + energy * 10 + pulse * 6;
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i];
        p.life += dt;
        if (p.life > p.span) {
          parts.splice(i, 1);
          continue;
        }
        const k = p.life / p.span;
        const twinkle = 0.7 + 0.3 * Math.sin((now / 160) * (1 + energy) + p.phase);
        p.y += p.vy * dt * speed;
        if (p.y < -4) {
          p.y = h + 3;
          p.x = Math.random() * w;
        }
        const edge = Math.min(1, Math.max(0, p.y / 14), Math.max(0, (h - p.y) / 14));
        ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * (0.9 + energy * 0.25) * twinkle) * edge;
        ctx.beginPath();
        ctx.arc(
          p.x + Math.sin((now / 900) * (1 + energy * 0.8) + p.phase) * p.sway,
          p.y,
          p.r * twinkle * (1 + energy * 0.35),
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    resize();
    for (let i = 0; i < 26; i += 1) spawn(true);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, w, h);
    };
  }, [maxed, reduce, sparkColor]);

  const setEffort = i => {
    const next = Math.max(0, Math.min(efforts.length - 1, i));
    if (next === effortIndex) return;
    setEffortIndex(next);
    latest.current.onEffortChange?.(efforts[next]);
  };
  const effortFromPointer = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const k = (e.clientX - rect.left - EDGE) / Math.max(1, rect.width - 2 * EDGE);
    setEffort(Math.round(k * (efforts.length - 1)));
  };
  const onEffortKey = e => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (step) {
      e.preventDefault();
      setEffort(effortIndex + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setEffort(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setEffort(efforts.length - 1);
    } else if (e.key === 'Escape') {
      setEffortOpen(false);
      focusInput();
    }
  };
  const stepAt = i => `calc(${EDGE}px + (100% - ${EDGE * 2}px) * ${i / Math.max(1, efforts.length - 1)})`;
  const fillAt = i => (i === efforts.length - 1 ? '100%' : `calc(${stepAt(i)} + 7px)`);

  const pick = row => {
    if (open === 'model') {
      setModelKey(row.key);
      setModelOpen(false);
      focusInput();
      return;
    }
    const head = token ? draft.slice(0, token.start) : draft;
    if (row.attach) {
      setDraft(head);
      Promise.resolve(latest.current.onAttach?.()).then(files => {
        if (!files) return;
        setAttachments(a => [...a, ...(Array.isArray(files) ? files : [files])]);
      });
    } else if (open === 'at') {
      setDraft(`${head}@${row.name} `);
    } else {
      setDraft(`${head}${row.name} `);
    }
    setPlusOpen(false);
    setDismissed(false);
    focusInput();
  };

  const send = () => {
    if (!canSend || busy) return;
    latest.current.onSend?.(draft.trim(), { attachments, model, effort: level });
    setDraft('');
    setAttachments([]);
    setDismissed(false);
    closeMenus();
    focusInput();
  };

  const toggleListen = () => {
    if (listening) {
      dictation.current += 1;
      setListening(false);
      return;
    }
    const seq = ++dictation.current;
    setListening(true);
    Promise.resolve(latest.current.onDictate?.()).then(
      text => {
        if (seq !== dictation.current) return;
        setListening(false);
        if (text) setDraft(d => (d.trim() ? `${d.trimEnd()} ${text}` : text));
        focusInput();
      },
      () => {
        if (seq === dictation.current) setListening(false);
      }
    );
  };

  const onKeyDown = e => {
    if (open && list.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((cursor + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        pick(list[cursor]);
        return;
      }
    }
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setDismissed(true);
        closeMenus();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const down = e => {
    if (e.button !== 0 || !armed) return;
    setPressed(true);
  };
  const up = () => setPressed(false);

  return (
    <div
      ref={rootRef}
      className={`prompt-bar${className ? ` ${className}` : ''}`}
      data-busy={busy ? '' : undefined}
      data-max={maxed ? '' : undefined}
      style={{
        '--pb-bg': background,
        '--pb-ink': color,
        '--pb-menu': menuBackground,
        '--pb-w': `${width}px`,
        '--pb-radius': `${radius}px`,
        '--pb-spark': sparkColor,
        '--pb-press': pressScale
      }}
    >
      {open ? (
        <div
          className="prompt-bar__menu"
          role={open === 'effort' ? 'dialog' : 'listbox'}
          aria-label={
            open === 'at' ? 'Sources' : open === 'slash' ? 'Commands' : open === 'model' ? 'Models' : 'Effort'
          }
          data-kind={open}
        >
          {open === 'effort' ? (
            <>
              <div className="prompt-bar__effort-head">
                <span className="prompt-bar__effort-title">Effort</span>
                <span className="prompt-bar__effort-level">{level}</span>
                <span className="prompt-bar__effort-help" title="Higher effort thinks longer before answering">
                  <HugeiconsIcon icon={HelpCircleIcon} size={14} strokeWidth={1.8} />
                </span>
              </div>
              <div className="prompt-bar__effort-ends">
                <span>Faster</span>
                <span>Smarter</span>
              </div>
              <div
                className="prompt-bar__effort-track"
                role="slider"
                tabIndex={0}
                aria-label="Effort"
                aria-valuemin={0}
                aria-valuemax={efforts.length - 1}
                aria-valuenow={effortIndex}
                aria-valuetext={level}
                style={{ '--pb-effort-x': stepAt(effortIndex), '--pb-effort-fill': fillAt(effortIndex) }}
                onPointerDown={e => {
                  if (e.button !== 0) return;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {}
                  e.currentTarget.focus({ preventScroll: true });
                  effortFromPointer(e);
                }}
                onPointerMove={e => {
                  if (e.buttons & 1) effortFromPointer(e);
                }}
                onKeyDown={onEffortKey}
              >
                <span className="prompt-bar__effort-fill" />
                {efforts.map((label, i) => (
                  <i key={label} className="prompt-bar__effort-dot" style={{ left: stepAt(i) }} />
                ))}
                <span className="prompt-bar__effort-thumb" />
              </div>
            </>
          ) : (
            <>
              <span ref={glowRef} className="prompt-bar__glow" aria-hidden="true" />
              {list.map((row, i) => (
                <button
                  key={row.key}
                  ref={el => {
                    rowRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className="prompt-bar__row"
                  onMouseDown={e => e.preventDefault()}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => pick(row)}
                >
                  {open === 'at' ? <span className="prompt-bar__row-icon">{renderIcon(row.icon, 15)}</span> : null}
                  <span className="prompt-bar__row-name">{row.name}</span>
                  {row.description ? <span className="prompt-bar__row-desc">{row.description}</span> : null}
                  {open === 'model' ? (
                    <>
                      <span className="prompt-bar__row-tag">{row.tag}</span>
                      <span className="prompt-bar__row-check" data-on={row.key === model?.key ? '' : undefined}>
                        <HugeiconsIcon icon={Tick02Icon} size={13} strokeWidth={2.5} />
                      </span>
                    </>
                  ) : null}
                </button>
              ))}
              {list.length === 0 ? <div className="prompt-bar__empty">No matches for “{query}”</div> : null}
            </>
          )}
        </div>
      ) : null}

      <div
        className="prompt-bar__field"
        role="presentation"
        data-max={maxed ? '' : undefined}
        onPointerDown={e => {
          if (e.target === e.currentTarget || e.target === inputRef.current) closeMenus();
        }}
        onClick={focusInput}
      >
        <canvas ref={sparkRef} className="prompt-bar__sparks" aria-hidden="true" />
        {attachments.length > 0 ? (
          <div className="prompt-bar__chips">
            {attachments.map((file, i) => (
              <span key={`${file}-${i}`} className="prompt-bar__chip">
                <HugeiconsIcon icon={File02Icon} size={12} strokeWidth={2} />
                <span className="prompt-bar__chip-name">{file}</span>
                <button
                  type="button"
                  className="prompt-bar__chip-x"
                  aria-label={`Remove ${file}`}
                  onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <textarea
          ref={inputRef}
          className="prompt-bar__input"
          rows={1}
          value={draft}
          placeholder={listening ? 'Listening…' : placeholder}
          aria-label="Prompt"
          onChange={e => {
            setDraft(e.target.value);
            typing.current.energy = Math.min(1.6, typing.current.energy + 0.22);
            typing.current.strokes = Math.min(4, typing.current.strokes + 1);
            setDismissed(false);
            closeMenus();
            setActive(0);
          }}
          onFocus={closeMenus}
          onKeyDown={onKeyDown}
        />

        <div className="prompt-bar__bar">
          <button
            type="button"
            className="prompt-bar__tool"
            aria-label="Add files and sources"
            aria-expanded={plusOpen}
            data-on={plusOpen ? '' : undefined}
            onMouseDown={e => e.preventDefault()}
            onClick={() => {
              setModelOpen(false);
              setEffortOpen(false);
              setActive(0);
              setPlusOpen(v => !v);
              focusInput();
            }}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2} />
          </button>
          {models.length > 0 ? (
            <button
              type="button"
              className="prompt-bar__pick"
              aria-label="Choose model"
              aria-expanded={modelOpen}
              data-on={modelOpen ? '' : undefined}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setPlusOpen(false);
                setEffortOpen(false);
                setActive(Math.max(0, models.indexOf(model)));
                setModelOpen(v => !v);
                focusInput();
              }}
            >
              <span>{model.name}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2.4} />
            </button>
          ) : null}
          {efforts.length > 0 ? (
            <button
              type="button"
              className="prompt-bar__pick"
              aria-label="Choose effort"
              aria-expanded={effortOpen}
              data-on={effortOpen ? '' : undefined}
              data-max={maxed ? '' : undefined}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                setPlusOpen(false);
                setModelOpen(false);
                setEffortOpen(v => !v);
                focusInput();
              }}
            >
              <HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={2} />
              <span>{level}</span>
            </button>
          ) : null}
          <span className="prompt-bar__spacer" />
          {onDictate ? (
            <button
              type="button"
              className="prompt-bar__tool"
              aria-label={listening ? 'Stop dictation' : 'Dictate'}
              aria-pressed={listening}
              data-on={listening ? '' : undefined}
              onMouseDown={e => e.preventDefault()}
              onClick={toggleListen}
            >
              {listening ? (
                <span className="prompt-bar__eq" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <HugeiconsIcon icon={Mic01Icon} size={15} strokeWidth={2} />
              )}
            </button>
          ) : null}
          <button
            type="button"
            className="prompt-bar__send"
            disabled={!armed}
            aria-label={busy ? 'Stop' : 'Send'}
            data-armed={armed ? '' : undefined}
            data-pressed={pressed ? '' : undefined}
            onMouseDown={e => e.preventDefault()}
            onPointerDown={down}
            onPointerUp={up}
            onPointerCancel={up}
            onPointerLeave={up}
            onClick={() => {
              if (busy) latest.current.onStop?.();
              else send();
            }}
          >
            <SendGlyph busy={busy} morphDuration={morphDuration} squash={squash} tilt={tilt} />
          </button>
        </div>
      </div>
    </div>
  );
}

```

### Component CSS
```css
.prompt-bar {
  --pb-bg: #27272a;
  --pb-ink: #f5f5f5;
  --pb-menu: #323236;
  --pb-w: 400px;
  --pb-radius: 16px;
  --pb-press: 0.96;
  --pb-spark: #b39dff;
  --pb-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --pb-muted: color-mix(in srgb, var(--pb-ink) 55%, transparent);
  --pb-hover: color-mix(in srgb, var(--pb-ink) 8%, transparent);

  position: relative;
  width: min(var(--pb-w), 100%);
  color: var(--pb-ink);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
}

.prompt-bar__menu {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 2;
  padding: 4px;
  border-radius: 12px;
  background: var(--pb-menu);
  box-shadow:
    0 10px 30px -10px rgba(0, 0, 0, 0.35),
    0 1px 2px rgba(0, 0, 0, 0.08);
  transform-origin: bottom center;
  animation: prompt-bar-pop 180ms var(--pb-ease-out) both;
}

.prompt-bar__menu[data-kind='model'] {
  right: auto;
  width: 200px;
  transform-origin: bottom left;
}

@keyframes prompt-bar-pop {
  from {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
  }
}

.prompt-bar__glow {
  position: absolute;
  right: 4px;
  left: 4px;
  border-radius: 8px;
  background: var(--pb-hover);
  opacity: 0;
  pointer-events: none;
  transition:
    top 220ms var(--pb-ease-out),
    height 220ms var(--pb-ease-out),
    opacity 150ms ease;
}

.prompt-bar__row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.prompt-bar__row-icon {
  display: inline-flex;
  flex: none;
  justify-content: center;
  width: 20px;
  color: color-mix(in srgb, var(--pb-ink) 70%, transparent);
}

.prompt-bar__row-name {
  flex: none;
  font-size: 13px;
  font-weight: 500;
}

.prompt-bar__row-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--pb-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.prompt-bar__row-tag {
  flex: none;
  margin-left: auto;
  color: var(--pb-muted);
  font-size: 11px;
}

.prompt-bar__row-check {
  display: inline-flex;
  flex: none;
  justify-content: center;
  width: 16px;
  opacity: 0;
}

.prompt-bar__row-check[data-on] {
  opacity: 1;
}

.prompt-bar__empty {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  color: var(--pb-muted);
  font-size: 12px;
}

.prompt-bar__field {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--pb-radius);
  background: var(--pb-bg);
  cursor: text;
}

.prompt-bar__field::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: radial-gradient(
    140% 120% at 0% 100%,
    color-mix(in srgb, var(--pb-spark) 26%, transparent),
    transparent 62%
  );
  opacity: 0;
  pointer-events: none;
  transition: opacity 500ms ease;
}

.prompt-bar__field[data-max]::before {
  opacity: 1;
}

.prompt-bar__sparks {
  position: absolute;
  inset: 0;
  z-index: -1;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  pointer-events: none;
}

.prompt-bar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-bar__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 4px 0 8px;
  border-radius: 8px;
  background: var(--pb-hover);
  font-size: 12px;
  animation: prompt-bar-pop 200ms var(--pb-ease-out) both;
}

.prompt-bar__chip-name {
  max-width: 144px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.prompt-bar__chip-x {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  outline: none;
  transition:
    opacity 120ms ease,
    background-color 120ms ease;
}

.prompt-bar__chip-x:hover {
  background: color-mix(in srgb, var(--pb-ink) 10%, transparent);
  opacity: 1;
}

.prompt-bar__input {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  resize: none;
  outline: none;
  overflow-wrap: anywhere;
}

.prompt-bar__input::placeholder {
  color: color-mix(in srgb, var(--pb-ink) 45%, transparent);
}

@media (pointer: coarse) {
  .prompt-bar__input {
    font-size: 16px;
  }
}

.prompt-bar__bar {
  display: flex;
  align-items: center;
  gap: 4px;
}

.prompt-bar__spacer {
  flex: 1 1 auto;
}

.prompt-bar__tool,
.prompt-bar__pick,
.prompt-bar__send {
  flex: none;
  border: 0;
  font: inherit;
  cursor: pointer;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.prompt-bar__tool {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--pb-ink) 60%, transparent);
  transition:
    background-color 150ms ease,
    color 150ms ease,
    transform 160ms var(--pb-ease-out);
}

.prompt-bar__tool:active {
  transform: scale(0.94);
}

.prompt-bar__pick {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--pb-ink) 70%, transparent);
  font-size: 12px;
  font-weight: 500;
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.prompt-bar__tool[data-on],
.prompt-bar__pick[data-on] {
  background: var(--pb-hover);
  color: var(--pb-ink);
}

@media (hover: hover) and (pointer: fine) {
  .prompt-bar__tool:hover,
  .prompt-bar__pick:hover {
    background: var(--pb-hover);
    color: var(--pb-ink);
  }
}

.prompt-bar__pick[data-max] {
  color: var(--pb-spark);
}

.prompt-bar__menu[data-kind='effort'] {
  right: auto;
  width: 248px;
  padding: 12px 14px 14px;
  transform-origin: bottom left;
}

.prompt-bar__effort-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 18px;
}

.prompt-bar__effort-title {
  color: var(--pb-muted);
}

.prompt-bar__effort-level {
  font-weight: 500;
}

.prompt-bar__effort-help {
  display: inline-flex;
  margin-left: auto;
  color: var(--pb-muted);
}

.prompt-bar__effort-ends {
  display: flex;
  justify-content: space-between;
  margin-top: 12px;
  color: var(--pb-muted);
  font-size: 12px;
  line-height: 16px;
}

.prompt-bar__effort-track {
  position: relative;
  height: 22px;
  margin-top: 8px;
  border-radius: 11px;
  background: var(--pb-hover);
  cursor: pointer;
  outline: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.prompt-bar__effort-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--pb-effort-fill);
  border-radius: 11px;
  background: color-mix(in srgb, var(--pb-ink) 18%, transparent);
  transition:
    width 220ms var(--pb-ease-out),
    background-color 300ms ease;
}

.prompt-bar__effort-dot {
  position: absolute;
  top: 50%;
  width: 4px;
  height: 4px;
  margin: -2px 0 0 -2px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pb-ink) 30%, transparent);
}

.prompt-bar__effort-thumb {
  position: absolute;
  top: -3px;
  left: var(--pb-effort-x);
  width: 14px;
  height: 28px;
  margin-left: -7px;
  border-radius: 7px;
  background: var(--pb-ink);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  transition:
    left 220ms var(--pb-ease-out),
    background-color 300ms ease;
}

.prompt-bar[data-max] .prompt-bar__effort-fill {
  background: color-mix(in srgb, var(--pb-spark) 35%, transparent);
}

.prompt-bar[data-max] .prompt-bar__effort-thumb {
  background: var(--pb-spark);
}

.prompt-bar__eq {
  display: flex;
  align-items: center;
  gap: 2.5px;
  height: 14px;
}

.prompt-bar__eq i {
  display: block;
  width: 2.5px;
  height: 100%;
  border-radius: 999px;
  background: currentColor;
  transform-origin: center;
  animation: prompt-bar-eq 900ms ease-in-out infinite;
}

.prompt-bar__eq i:nth-child(2) {
  animation-delay: 150ms;
}

.prompt-bar__eq i:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes prompt-bar-eq {
  0%,
  100% {
    transform: scaleY(0.35);
  }

  50% {
    transform: scaleY(1);
  }
}

.prompt-bar__send {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--pb-ink) 12%, var(--pb-bg));
  color: color-mix(in srgb, var(--pb-ink) 55%, var(--pb-bg));
  transition:
    background-color 200ms ease,
    color 200ms ease,
    transform 160ms var(--pb-ease-out);
}

.prompt-bar__send:disabled {
  cursor: default;
}

.prompt-bar__send[data-armed] {
  background: var(--pb-ink);
  color: var(--pb-bg);
}

.prompt-bar__send[data-pressed] {
  transform: scale(var(--pb-press));
}

.prompt-bar__glyph {
  display: block;
  width: 16px;
  height: 16px;
  transform-origin: 50% 50%;
}

@media (prefers-reduced-motion: reduce) {
  .prompt-bar__menu,
  .prompt-bar__chip {
    animation: none;
  }

  .prompt-bar__glow {
    transition: opacity 150ms ease;
  }

  .prompt-bar__effort-fill,
  .prompt-bar__effort-thumb {
    transition: background-color 300ms ease;
  }

  .prompt-bar__tool:active,
  .prompt-bar__send[data-pressed] {
    transform: none;
  }
}

```

### Integration Instructions
1. Install any listed dependencies.
2. Copy the component source into the appropriate directory in the project.
3. Import the CSS file alongside the component.
4. Import and render the component using the usage example above as a starting point.
5. Adjust props as needed for the specific use case — refer to the props table for all available options.

### More from React Bits
The full library index, including everything reactbits.dev offers, is at https://reactbits.dev/llms.txt — fetch it if this component is not the right fit or the project needs more pieces.
