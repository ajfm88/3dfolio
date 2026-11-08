// A smooth step between two handles on the same node either collapses or cuts
// through the shape. This is the render-only exception: a curve that stays
// outside the live box. Nothing returned here is stored or validated.

const SIDES = ["top", "right", "bottom", "left"];
const OUTWARD = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

const MARGIN = 36;
const FILLET = 16;
const SAME_SIDE_REACH = 64;

function sideOf(value) {
  return SIDES.includes(value) ? value : "top";
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function fmt(value) {
  return (Math.round(value * 100) / 100).toString();
}

function clamp01(value) {
  if (!finite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function usableBox(box, sx, sy, tx, ty) {
  if (box && finite(box.x) && finite(box.y) && finite(box.width) && finite(box.height) && box.width > 0 && box.height > 0) {
    return box;
  }
  const minX = Math.min(sx, tx);
  const minY = Math.min(sy, ty);
  return {
    x: minX,
    y: minY,
    width: Math.max(1, Math.max(sx, tx) - minX),
    height: Math.max(1, Math.max(sy, ty) - minY),
  };
}

function outerRect(box) {
  return {
    left: box.x - MARGIN,
    top: box.y - MARGIN,
    right: box.x + box.width + MARGIN,
    bottom: box.y + box.height + MARGIN,
  };
}

function project(side, x, y, rect) {
  if (side === "top") return { x, y: rect.top };
  if (side === "right") return { x: rect.right, y };
  if (side === "bottom") return { x, y: rect.bottom };
  return { x: rect.left, y };
}

// Clockwise parameter around the expanded box: 0 top, 1 right, 2 bottom, 3 left.
function perimeterT(side, point, rect) {
  const width = Math.max(rect.right - rect.left, 1);
  const height = Math.max(rect.bottom - rect.top, 1);
  if (side === "top") return clamp01((point.x - rect.left) / width);
  if (side === "right") return 1 + clamp01((point.y - rect.top) / height);
  if (side === "bottom") return 2 + clamp01((rect.right - point.x) / width);
  return 3 + clamp01((rect.bottom - point.y) / height);
}

function pointAt(t, rect) {
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const u = ((t % 4) + 4) % 4;
  if (u <= 1) return { x: rect.left + u * width, y: rect.top };
  if (u <= 2) return { x: rect.right, y: rect.top + (u - 1) * height };
  if (u <= 3) return { x: rect.right - (u - 2) * width, y: rect.bottom };
  return { x: rect.left, y: rect.bottom - (u - 3) * height };
}

function cornersBetween(start, end, rect) {
  const points = [];
  if (end >= start) {
    for (let corner = Math.floor(start) + 1; corner < end - 1e-6; corner += 1) {
      points.push(pointAt(corner, rect));
    }
    return points;
  }
  for (let corner = Math.ceil(start) - 1; corner > end + 1e-6; corner -= 1) {
    points.push(pointAt(corner, rect));
  }
  return points;
}

function midpoint(points) {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0];
  let total = 0;
  const lengths = [];
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(len);
    total += len;
  }
  if (total < 1e-6) return points[0];
  let walked = 0;
  const target = total / 2;
  for (let i = 0; i < lengths.length; i += 1) {
    if (walked + lengths[i] >= target - 1e-6) {
      const span = lengths[i] < 1e-6 ? 0 : (target - walked) / lengths[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * span,
        y: points[i].y + (points[i + 1].y - points[i].y) * span,
      };
    }
    walked += lengths[i];
  }
  return points[points.length - 1];
}

function pathFromPoints(points) {
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  if (points.length === 2) {
    return `${d} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const inX = curr.x - prev.x;
    const inY = curr.y - prev.y;
    const outX = next.x - curr.x;
    const outY = next.y - curr.y;
    const inLen = Math.hypot(inX, inY);
    const outLen = Math.hypot(outX, outY);
    if (inLen < 0.01 || outLen < 0.01) {
      d += ` L ${fmt(curr.x)} ${fmt(curr.y)}`;
      continue;
    }
    const radius = Math.min(FILLET, inLen / 2, outLen / 2);
    const ax = curr.x - (inX / inLen) * radius;
    const ay = curr.y - (inY / inLen) * radius;
    const bx = curr.x + (outX / outLen) * radius;
    const by = curr.y + (outY / outLen) * radius;
    d += ` L ${fmt(ax)} ${fmt(ay)} Q ${fmt(curr.x)} ${fmt(curr.y)} ${fmt(bx)} ${fmt(by)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

// One handle, or two handles on the same side. The controls sit in the
// outside half-plane, so the curve cannot cross the node.
function sameSideLoop(sx, sy, tx, ty, side) {
  const outward = OUTWARD[side];
  const perpendicular = { x: -outward.y, y: outward.x };
  const separated = Math.hypot(tx - sx, ty - sy) >= 1;
  const spread = separated ? 0 : SAME_SIDE_REACH;
  const c1 = {
    x: sx + outward.x * SAME_SIDE_REACH + perpendicular.x * spread,
    y: sy + outward.y * SAME_SIDE_REACH + perpendicular.y * spread,
  };
  const c2 = {
    x: tx + outward.x * SAME_SIDE_REACH - perpendicular.x * spread,
    y: ty + outward.y * SAME_SIDE_REACH - perpendicular.y * spread,
  };
  return {
    path: `M ${fmt(sx)} ${fmt(sy)} C ${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(tx)} ${fmt(ty)}`,
    labelX: 0.125 * sx + 0.375 * c1.x + 0.375 * c2.x + 0.125 * tx,
    labelY: 0.125 * sy + 0.375 * c1.y + 0.375 * c2.y + 0.125 * ty,
  };
}

function exteriorLoop(sx, sy, tx, ty, sourceSide, targetSide, box) {
  const rect = outerRect(box);
  const start = project(sourceSide, sx, sy, rect);
  const end = project(targetSide, tx, ty, rect);
  const t0 = perimeterT(sourceSide, start, rect);
  const t1 = perimeterT(targetSide, end, rect);
  let clockwise = t1 - t0;
  if (clockwise < 0) clockwise += 4;
  // Equal lengths take the clockwise walk so opposite sides stay stable.
  const forward = clockwise <= 2;
  let endT = t1;
  if (forward && endT < t0) endT += 4;
  if (!forward && endT > t0) endT -= 4;
  const corners = cornersBetween(t0, endT, rect);
  const outer = [start, ...corners, end];
  const label = midpoint(outer);
  return {
    path: pathFromPoints([{ x: sx, y: sy }, ...outer, { x: tx, y: ty }]),
    labelX: label.x,
    labelY: label.y,
  };
}

export function selfLoopGeometry({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  box,
}) {
  const sx = finite(sourceX) ? sourceX : 0;
  const sy = finite(sourceY) ? sourceY : 0;
  const tx = finite(targetX) ? targetX : sx;
  const ty = finite(targetY) ? targetY : sy;
  const sourceSide = sideOf(sourcePosition);
  const targetSide = sideOf(targetPosition);

  if (sourceSide === targetSide) {
    return sameSideLoop(sx, sy, tx, ty, sourceSide);
  }
  return exteriorLoop(sx, sy, tx, ty, sourceSide, targetSide, usableBox(box, sx, sy, tx, ty));
}
