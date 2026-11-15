import { useId, useState } from "react";
import { DEFAULT_NODE_SIZE, NODE_COLORS } from "@shared/canvasOps.js";
import { CANVAS_TEMPLATES, TEMPLATE_GROUPS, templateBounds } from "../../lib/canvasTemplates";
import Dialog from "../ui/Dialog";

const SECONDARY = "rounded-xl border border-[var(--collab-border)] px-4 py-2 text-sm font-semibold text-[var(--collab-text)] hover:bg-[var(--collab-panel-2)] disabled:cursor-not-allowed disabled:opacity-50";

function TemplatePreview({ template }) {
  const box = templateBounds(template);
  const scale = Math.min(468 / box.width, 188 / box.height);
  const nodes = template.nodes.map((node) => ({ ...node, width: node.width ?? DEFAULT_NODE_SIZE[node.shape].width, height: node.height ?? DEFAULT_NODE_SIZE[node.shape].height }));
  const center = (key) => {
    const node = nodes.find((node) => node.key === key);
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 500 220" preserveAspectRatio="xMidYMid meet" className="w-full">
      <g transform={`translate(${(500 - box.width * scale) / 2} ${(220 - box.height * scale) / 2}) scale(${scale}) translate(${-box.x} ${-box.y})`}>
        {template.edges.map((edge, index) => {
          const from = center(edge.from), to = center(edge.to);
          return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="var(--collab-edge)" />;
        })}
        {nodes.map((node) => {
          const { x, y, width: w, height: h, shape } = node;
          const props = { style: { fill: NODE_COLORS.find((pair) => pair.name === node.color).fill }, stroke: "var(--collab-node-border-selected)" };
          if (shape === "circle") return <ellipse key={node.key} {...props} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} />;
          if (shape === "diamond") return <polygon key={node.key} {...props} points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} />;
          if (shape === "hexagon") return <polygon key={node.key} {...props} points={`${x + w / 4},${y} ${x + 3 * w / 4},${y} ${x + w},${y + h / 2} ${x + 3 * w / 4},${y + h} ${x + w / 4},${y + h} ${x},${y + h / 2}`} />;
          return <rect key={node.key} {...props} x={x} y={y} width={w} height={h} rx={shape === "pill" ? h / 2 : 8} />;
        })}
      </g>
    </svg>
  );
}

export default function TemplatesDialog({ open, onClose, onAdd, initialGroup = TEMPLATE_GROUPS[0].id }) {
  const id = useId();
  const [groupId, setGroupId] = useState(initialGroup);
  const shown = TEMPLATE_GROUPS.find((group) => group.id === groupId) ?? TEMPLATE_GROUPS[0];
  return (
    <Dialog open={open} onClose={onClose} labelledBy={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-2xl font-bold">Starter templates</h2>
      <p className="mt-2 text-sm text-[var(--collab-muted)]">Adds the diagram to your canvas. Nothing is replaced, and Undo removes it.</p>
  <div role="group" aria-label="Template groups" className="mt-4 flex flex-wrap gap-2">
    {TEMPLATE_GROUPS.map((group) => (
      <button key={group.id} type="button" aria-pressed={group.id === shown.id} onClick={() => setGroupId(group.id)}
        className={`rounded-full border px-3 py-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--collab-accent)] ${group.id === shown.id
          ? "border-[var(--collab-border-strong)] bg-[var(--collab-panel-2)] text-[var(--collab-text)]"
          : "border-[var(--collab-border)] text-[var(--collab-muted)] hover:text-[var(--collab-text)]"}`}>
        {group.title}
      </button>
    ))}
  </div>
      <div key={shown.id} className="mt-4 max-h-[60vh] space-y-6 overflow-y-auto">
          <section aria-labelledby={`${id}-${shown.id}`} className="space-y-4">
            <h3 id={`${id}-${shown.id}`} className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--collab-accent-2)]">{shown.title}</h3>
            {CANVAS_TEMPLATES.filter((template) => template.group === shown.id).map((template) => (
          <article key={template.id} className="rounded-2xl border border-[var(--collab-border)] bg-[var(--collab-panel-2)] p-4">
            <TemplatePreview template={template} />
            <h4 className="text-base font-semibold">{template.name}</h4>
            <p className="mt-2 text-sm text-[var(--collab-muted)]">{template.description}</p>
            <button type="button" className={`${SECONDARY} mt-4`} aria-label={`Add ${template.name} template`} onClick={() => onAdd(template)}>Add to canvas</button>
          </article>
            ))}
          </section>
      </div>
      <div className="mt-6 flex justify-end"><button type="button" data-autofocus className={SECONDARY} onClick={onClose}>Close</button></div>
    </Dialog>
  );
}
