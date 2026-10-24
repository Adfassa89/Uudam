/**
 * Maths for the camera ("AR") view: where a real-world point appears on the
 * screen, given the phone's position (GPS) and orientation (compass + gyro).
 *
 * Frames
 *   World ENU:  x = East, y = North, z = Up (metres, centred on the phone).
 *   Device:     x = right edge, y = top edge, z = out of the screen towards you.
 *   The back camera looks along −z; the app is locked to portrait.
 */

export type Vec3 = [number, number, number];
/** Row-major 3×3 matrix mapping device coordinates → world ENU. */
export type Mat3 = number[];

const PI = Math.PI;
const toRad = (d: number) => (d * PI) / 180;

/**
 * Rotation from W3C DeviceOrientation Euler angles (radians): R = Rz(α)·Rx(β)·Ry(γ).
 * α = 0 means the phone's top edge points north (magnetic, unless corrected).
 */
export function rotationFromEuler(alpha: number, beta: number, gamma: number): Mat3 {
  const cA = Math.cos(alpha);
  const sA = Math.sin(alpha);
  const cB = Math.cos(beta);
  const sB = Math.sin(beta);
  const cG = Math.cos(gamma);
  const sG = Math.sin(gamma);
  return [
    cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG,
    sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG,
    -cB * sG, sB, cB * cG,
  ];
}

/**
 * Converts expo-sensors DeviceMotion `rotation` into W3C α (radians).
 * - Android: Expo already maps SensorManager.getOrientation to W3C angles
 *   (α = −azimuth, β = −pitch, γ = roll), referenced to magnetic north.
 * - iOS: CoreMotion yaw in the "X = magnetic north, Z = up" frame, whose Y axis
 *   points west; turning that frame into East-North-Up adds 90° to yaw.
 */
export function w3cAlpha(alpha: number, platform: string): number {
  return platform === 'ios' ? alpha + PI / 2 : alpha;
}

/**
 * Rotates a device→world matrix about the vertical axis by `deg` degrees
 * clockwise seen from above — used for magnetic declination and the user's
 * manual heading correction (a positive value turns the overlay to the right).
 */
export function rotateHeading(R: Mat3, deg: number): Mat3 {
  const t = toRad(-deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Rz(t) · R
  return [
    c * R[0] - s * R[3], c * R[1] - s * R[4], c * R[2] - s * R[5],
    s * R[0] + c * R[3], s * R[1] + c * R[4], s * R[2] + c * R[5],
    R[6], R[7], R[8],
  ];
}

/**
 * Smooths sensor jitter by blending matrices and re-orthonormalising
 * (blending Euler angles would break when the phone is held upright,
 * exactly how it is held for the camera).
 */
export function smoothRotation(prev: Mat3 | null, next: Mat3, k: number): Mat3 {
  if (!prev) return next;
  const m = next.map((v, i) => prev[i] + (v - prev[i]) * k);
  // Columns are the device axes in world coordinates; Gram–Schmidt on x and y.
  const x: Vec3 = [m[0], m[3], m[6]];
  const y: Vec3 = [m[1], m[4], m[7]];
  const nx = Math.hypot(...x);
  x[0] /= nx; x[1] /= nx; x[2] /= nx;
  const d = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  y[0] -= d * x[0]; y[1] -= d * x[1]; y[2] -= d * x[2];
  const ny = Math.hypot(...y);
  y[0] /= ny; y[1] /= ny; y[2] /= ny;
  const z: Vec3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

/** Compass direction (degrees from north) and tilt above the horizon of where the camera points. */
export function cameraDirection(R: Mat3): { azimuth: number; elevation: number } {
  // Camera looks along −z of the device: world vector = −(third column).
  const e = -R[2];
  const n = -R[5];
  const u = -R[8];
  const azimuth = ((Math.atan2(e, n) * 180) / PI + 360) % 360;
  const elevation = (Math.atan2(u, Math.hypot(e, n)) * 180) / PI;
  return { azimuth, elevation };
}

// WGS84 local radii (as in geo/measure.ts)
const A = 6378137;
const E2 = 0.00669437999014;
const EARTH_R = 6371000;

/**
 * Position of a target relative to the observer in metres (East, North, Up).
 * "Up" includes the drop of the Earth's curvature (≈ 0.08 m at 1 km, 2 m at 5 km).
 */
export function enuOffset(
  from: { lat: number; lon: number; alt: number },
  to: { lat: number; lon: number; alt: number },
): Vec3 {
  const lat = toRad((from.lat + to.lat) / 2);
  const w = 1 - E2 * Math.sin(lat) ** 2;
  const meridian = (A * (1 - E2)) / (w * Math.sqrt(w));
  const parallel = (A / Math.sqrt(w)) * Math.cos(lat);
  const e = toRad(to.lon - from.lon) * parallel;
  const n = toRad(to.lat - from.lat) * meridian;
  const drop = (e * e + n * n) / (2 * EARTH_R);
  return [e, n, to.alt - from.alt - drop];
}

/** World ENU vector → device coordinates (R is orthonormal, so the inverse is the transpose). */
export function toDevice(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[3] * v[1] + R[6] * v[2],
    R[1] * v[0] + R[4] * v[1] + R[7] * v[2],
    R[2] * v[0] + R[5] * v[1] + R[8] * v[2],
  ];
}

export interface Screen {
  width: number;
  height: number;
  /** Vertical field of view of the camera preview, degrees (portrait). */
  vfovDeg: number;
}

/** Points closer than this in front of the lens are treated as behind it. */
const NEAR = 1;

const focal = (s: Screen) => s.height / 2 / Math.tan(toRad(s.vfovDeg) / 2);

/** Device-space point → screen pixels, or null if it is behind the camera. */
export function projectDevice(d: Vec3, s: Screen): { x: number; y: number; depth: number } | null {
  const depth = -d[2];
  if (depth < NEAR) return null;
  const f = focal(s);
  return { x: s.width / 2 + (f * d[0]) / depth, y: s.height / 2 - (f * d[1]) / depth, depth };
}

/**
 * Projects a polyline, cutting it where it passes behind the camera.
 * Returns screen-space pieces (each at least 2 points).
 */
export function projectLine(pointsDevice: Vec3[], s: Screen): { x: number; y: number }[][] {
  const pieces: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  const flush = () => {
    if (cur.length >= 2) pieces.push(cur);
    cur = [];
  };
  for (let i = 0; i < pointsDevice.length; i++) {
    const p = pointsDevice[i];
    const inFront = -p[2] >= NEAR;
    if (i > 0) {
      const q = pointsDevice[i - 1];
      const prevFront = -q[2] >= NEAR;
      if (inFront !== prevFront) {
        // Point where the segment crosses the near plane z = −NEAR.
        const t = (-NEAR - q[2]) / (p[2] - q[2]);
        const c: Vec3 = [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t, -NEAR];
        const cp = projectDevice(c, s)!;
        if (prevFront) {
          cur.push(cp);
          flush();
        } else cur.push(cp);
      }
    }
    if (inFront) cur.push(projectDevice(p, s)!);
  }
  flush();
  return pieces;
}

/**
 * For a target outside the screen: the angle (degrees, 0 = up, clockwise) to
 * draw an edge arrow pointing towards it.
 */
export function offscreenAngle(d: Vec3): number {
  // Use the direction in the screen plane; if the target is behind, flip so the arrow
  // points the shorter way round.
  const x = d[0];
  const y = d[1];
  return ((Math.atan2(x, y) * 180) / PI + 360) % 360;
}
