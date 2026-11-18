function numberAt(base: usize, slot: i32): f64 {
  return load<f64>(base + slot * 8);
}

// Capsules are packed once: minimum/maximum bounds, start point, axis,
// squared axis length, start radius, radius change and surface friction.
export function collideParticles(
  count: i32,
  previous: usize,
  capsules: usize,
  capCount: i32,
  useTable: bool,
  tableX: f64,
  tableZ: f64,
  top: f64,
  depth: f64,
  radius: f64,
): void {
  const thickness = 0.45;
  for (let i = 0; i < count; i++) {
    const p = <usize>(i * 12),
      v = previous + p;
    let x: f64 = load<f32>(p),
      y: f64 = load<f32>(p + 4),
      z: f64 = load<f32>(p + 8);
    if (useTable && y < top + thickness && y > top - depth) {
      const dx = x - tableX,
        dz = z - tableZ;
      const rr = Math.sqrt(dx * dx + dz * dz);
      const up = top + thickness - y,
        side = radius + thickness - rr;
      if (side > 0) {
        if (up < side) store<f32>(p + 4, <f32>(top + thickness));
        else {
          const scale = (radius + thickness) / (rr != 0 ? rr : 1);
          store<f32>(p, <f32>(tableX + dx * scale));
          store<f32>(p + 8, <f32>(tableZ + dz * scale));
        }
        x = load<f32>(p);
        y = load<f32>(p + 4);
        z = load<f32>(p + 8);
        store<f32>(v, <f32>(<f64>load<f32>(v) * 0.3 + x * 0.7));
        store<f32>(v + 4, <f32>(<f64>load<f32>(v + 4) * 0.5 + y * 0.5));
        store<f32>(v + 8, <f32>(<f64>load<f32>(v + 8) * 0.3 + z * 0.7));
      }
    }
    for (let j = 0; j < capCount; j++) {
      const c = capsules + j * 16 * 8;
      if (
        x < numberAt(c, 0) ||
        x > numberAt(c, 1) ||
        y < numberAt(c, 2) ||
        y > numberAt(c, 3) ||
        z < numberAt(c, 4) ||
        z > numberAt(c, 5)
      )
        continue;
      const ax = numberAt(c, 6),
        ay = numberAt(c, 7),
        az = numberAt(c, 8);
      const bx = numberAt(c, 9),
        by = numberAt(c, 10),
        bz = numberAt(c, 11),
        len2 = numberAt(c, 12);
      let t =
        len2 != 0 ? ((x - ax) * bx + (y - ay) * by + (z - az) * bz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const qx = ax + bx * t,
        qy = ay + by * t,
        qz = az + bz * t;
      const dx = x - qx,
        dy = y - qy,
        dz = z - qz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = numberAt(c, 13) + numberAt(c, 14) * t + thickness;
      if (d < r && d > 1e-6) {
        const scale = r / d,
          friction = numberAt(c, 15);
        store<f32>(p, <f32>(qx + dx * scale));
        store<f32>(p + 4, <f32>(qy + dy * scale));
        store<f32>(p + 8, <f32>(qz + dz * scale));
        x = load<f32>(p);
        y = load<f32>(p + 4);
        z = load<f32>(p + 8);
        store<f32>(v, <f32>(<f64>load<f32>(v) * (1 - friction) + x * friction));
        store<f32>(
          v + 4,
          <f32>(<f64>load<f32>(v + 4) * (1 - friction) + y * friction),
        );
        store<f32>(
          v + 8,
          <f32>(<f64>load<f32>(v + 8) * (1 - friction) + z * friction),
        );
      }
    }
  }
}
