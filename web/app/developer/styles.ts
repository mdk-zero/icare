/**
 * The console is always dark, whatever the app's theme is set to.
 *
 * That is the point: /developer edits rows with no validation but the
 * database's own, and it should never be mistaken at a glance for the admin
 * screens that sit one URL away. A different surface is the cheapest possible
 * reminder of which one you are looking at.
 */
export const CONSOLE_STYLES = `
.dc {
  --dc-bg: #0b1214;
  --dc-panel: #101a1d;
  --dc-raise: #162428;
  --dc-line: #223338;
  --dc-line-soft: #1a2a2e;
  --dc-text: #dce9e9;
  --dc-dim: #7f979c;
  --dc-accent: #5eead4;
  --dc-danger: #fb7185;
  --dc-warn: #fbbf24;
  background: var(--dc-bg);
  color: var(--dc-text);
  color-scheme: dark;
}
.dc ::selection { background: rgba(94,234,212,0.25); }

.dc-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.dc-scroll::-webkit-scrollbar-track { background: transparent; }
.dc-scroll::-webkit-scrollbar-thumb { background: #2c4147; border-radius: 4px; }
.dc-scroll::-webkit-scrollbar-thumb:hover { background: #3a555c; }

.dc-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 10px; border-radius: 6px;
  border: 1px solid var(--dc-line);
  background: var(--dc-raise); color: var(--dc-text);
  font-size: 12px; font-weight: 500; line-height: 1.4;
  cursor: pointer; white-space: nowrap;
  transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.dc-btn:hover:not(:disabled) { background: #1d3036; border-color: #2e454b; }
.dc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.dc-btn-accent {
  background: var(--dc-accent); border-color: var(--dc-accent); color: #06231f; font-weight: 600;
}
.dc-btn-accent:hover:not(:disabled) { background: #7af0dc; border-color: #7af0dc; }
.dc-btn-danger { color: var(--dc-danger); border-color: #4a2730; background: #1e1418; }
.dc-btn-danger:hover:not(:disabled) { background: #2a1a1f; border-color: #63323d; }
.dc-btn-ghost { background: transparent; border-color: transparent; color: var(--dc-dim); }
.dc-btn-ghost:hover:not(:disabled) { background: var(--dc-raise); color: var(--dc-text); }

.dc-field {
  width: 100%; padding: 6px 9px; border-radius: 6px;
  border: 1px solid var(--dc-line); background: #0c1719; color: var(--dc-text);
  font-size: 12.5px; line-height: 1.5; outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}
.dc-field:focus {
  border-color: #2f6d68; box-shadow: 0 0 0 3px rgba(94,234,212,0.12);
}
.dc-field::placeholder { color: #55696e; }
.dc-field:disabled { background: #0a1214; color: var(--dc-dim); cursor: not-allowed; }
textarea.dc-field { font-family: var(--font-mono), monospace; resize: vertical; min-height: 68px; }
select.dc-field { cursor: pointer; }

.dc-tag {
  display: inline-block; padding: 1px 5px; border-radius: 4px;
  font-family: var(--font-mono), monospace; font-size: 10px; letter-spacing: 0.02em;
  background: var(--dc-raise); color: var(--dc-dim); border: 1px solid var(--dc-line-soft);
}
.dc-tag-key { color: var(--dc-warn); border-color: #3d3117; background: #1d1809; }
.dc-tag-fk { color: #93c5fd; border-color: #1e3352; background: #0d1826; }

/* The grid scrolls in both axes inside its own box; the page never does. */
.dc-grid { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; }
.dc-grid th {
  position: sticky; top: 0; z-index: 2;
  background: #0f1b1e; border-bottom: 1px solid var(--dc-line);
  padding: 7px 12px; text-align: left; white-space: nowrap;
  font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--dc-dim); user-select: none;
}
.dc-grid th.sortable { cursor: pointer; }
.dc-grid th.sortable:hover { color: var(--dc-text); }
.dc-grid td {
  padding: 6px 12px; border-bottom: 1px solid var(--dc-line-soft);
  font-family: var(--font-mono), monospace; font-size: 12px;
  max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.dc-grid tbody tr { cursor: pointer; }
.dc-grid tbody tr:hover td { background: #131f23; }
.dc-null { color: #4e6469; font-style: italic; }

.dc-rail button {
  display: block; width: 100%; text-align: left;
  padding: 5px 10px; border-radius: 6px; border: 1px solid transparent;
  background: transparent; color: var(--dc-dim); cursor: pointer;
  font-size: 12.5px; line-height: 1.5;
  transition: background 100ms ease, color 100ms ease;
}
.dc-rail button:hover { background: var(--dc-raise); color: var(--dc-text); }
.dc-rail button[data-selected="true"] {
  background: rgba(94,234,212,0.10); color: var(--dc-accent);
  border-color: rgba(94,234,212,0.22); font-weight: 500;
}

.dc-tab {
  padding: 6px 2px; margin-right: 18px; background: none; border: none;
  border-bottom: 2px solid transparent; color: var(--dc-dim);
  font-size: 13px; font-weight: 500; cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease;
}
.dc-tab:hover { color: var(--dc-text); }
.dc-tab[data-active="true"] { color: var(--dc-accent); border-bottom-color: var(--dc-accent); }

@keyframes dcSlideIn { from { transform: translateX(16px); opacity: 0; } to { transform: none; opacity: 1; } }
.dc-drawer { animation: dcSlideIn 180ms cubic-bezier(0.22,0.61,0.36,1); }
`;
