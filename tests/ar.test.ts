import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cameraDirection,
  enuOffset,
  projectDevice,
  projectLine,
  rotateHeading,
  rotationFromEuler,
  smoothRotation,
  toDevice,
  w3cAlpha,
  type Mat3,
  type Vec3,
} from '../src/ar/projection';

const deg = (d: number) => (d * Math.PI) / 180;
const close = (a: number, b: number, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const screen = { width: 400, height: 800, vfovDeg: 60 };

/** Phone held upright in portrait, camera facing compass direction `az` (W3C: α = −az, β = 90°). */
const upright = (az: number) => rotationFromEuler(deg(-az), deg(90), 0);

test('Android getOrientation → Expo angles → W3C matrix round-trips for random orientations', () => {
  // Android: azimuth = atan2(R01, R11), pitch = asin(−R21), roll = atan2(−R20, R22); Expo: α=−az, β=−pitch, γ=roll
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let k = 0; k < 500; k++) {
    const R = rotationFromEuler(rnd() * Math.PI, rnd() * (Math.PI / 2) * 0.99, rnd() * Math.PI);
    const azimuth = Math.atan2(R[1], R[4]);
    const pitch = Math.asin(-R[7]);
    const roll = Math.atan2(-R[6], R[8]);
    const R2 = rotationFromEuler(w3cAlpha(-azimuth, 'android'), -pitch, roll);
    R.forEach((v, i) => close(R2[i], v, 1e-9));
  }
});

test('camera direction of an upright phone and of a phone tilted up', () => {
  for (const az of [0, 45, 90, 180, 270]) {
    const d = cameraDirection(upright(az));
    close(((d.azimuth - az + 540) % 360) - 180, 0, 1e-6);
    close(d.elevation, 0, 1e-6);
  }
  // Tilting the top edge back by 20° (β = 110°) points the camera 20° above the horizon
  close(cameraDirection(rotationFromEuler(0, deg(110), 0)).elevation, 20, 1e-6);
});

test('heading correction turns the view clockwise', () => {
  close(cameraDirection(rotateHeading(upright(10), 5)).azimuth, 15, 1e-6);
  close(cameraDirection(rotateHeading(upright(10), -12)).azimuth, 358, 1e-6);
});

test('a point straight ahead lands in the screen centre; to the right lands right; above lands higher', () => {
  const R = upright(90); // facing east
  const ahead = projectDevice(toDevice(R, [100, 0, 0]), screen)!;
  close(ahead.x, 200, 1e-6);
  close(ahead.y, 400, 1e-6);
  close(ahead.depth, 100, 1e-6);
  const right = projectDevice(toDevice(R, [100, -20, 0]), screen)!; // south of east = right when facing east
  assert.ok(right.x > 200);
  const up = projectDevice(toDevice(R, [100, 0, 30]), screen)!;
  assert.ok(up.y < 400);
  // 30° above the axis with a 60° vertical FOV is exactly the top edge
  const edge = projectDevice(toDevice(R, [100, 0, 100 * Math.tan(deg(30))]), screen)!;
  close(edge.y, 0, 1e-6);
  assert.equal(projectDevice(toDevice(R, [-100, 0, 0]), screen), null, 'behind the camera');
});

test('lines crossing behind the camera are cut, not wrapped across the screen', () => {
  const R = upright(0); // facing north
  const world: Vec3[] = [
    [-50, 100, 0],
    [50, 100, 0], // in front
    [50, -100, 0], // behind
    [-50, -100, 0], // behind
    [-50, 100, 0], // in front again
  ];
  const pieces = projectLine(world.map((v) => toDevice(R, v)), screen);
  assert.equal(pieces.length, 2);
  for (const piece of pieces) for (const p of piece) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('enuOffset: 1 km north is ~1000 m north, curvature drop ≈ 8 cm', () => {
  const v = enuOffset({ lat: 43.6, lon: 105.85, alt: 1500 }, { lat: 43.6 + 1000 / 111_100, lon: 105.85, alt: 1500 });
  close(v[0], 0, 1e-9);
  assert.ok(Math.abs(v[1] - 1000) < 2, `${v[1]}`);
  assert.ok(v[2] < -0.07 && v[2] > -0.09, `${v[2]}`);
});

test('smoothRotation stays a proper rotation even when blending far-apart orientations', () => {
  const a: Mat3 = upright(350);
  const b: Mat3 = upright(10);
  const m = smoothRotation(a, b, 0.5);
  // orthonormal columns
  for (let c = 0; c < 3; c++) close(Math.hypot(m[c], m[3 + c], m[6 + c]), 1, 1e-9);
  close(cameraDirection(m).azimuth, 0, 1e-6); // halfway between 350° and 10° is north, not 180°
  assert.equal(smoothRotation(null, b, 0.5), b);
});

test('buildScene: nearby drawings in 3D, flat drawings at ground level, radius and target handling', async () => {
  const { buildScene } = await import('../src/ar/scene');
  const obs = { lat: 43.6, lon: 105.85, alt: 1501.5, groundAlt: 1500 };
  const near = 0.001; // ≈ 110 m
  const features = [
    // DXF bench crest with Z = 1480 m (20 m below the user's ground)
    { geom: { kind: 'line' as const, coords: [[105.85, 43.6 + near], [105.851, 43.6 + near]] as [number, number][] }, elevation: 1480, name: 'crest' },
    // flat KML road without height
    { geom: { kind: 'line' as const, coords: [[105.849, 43.6 - near], [105.851, 43.6 - near]] as [number, number][] }, name: 'road' },
    // far away (≈ 11 km) — outside a 1 km radius
    { geom: { kind: 'line' as const, coords: [[105.85, 43.7], [105.86, 43.7]] as [number, number][] }, name: 'far' },
    { geom: { kind: 'point' as const, coord: [105.8505, 43.6] as [number, number] }, name: 'BM-1' },
  ];
  const s = buildScene(obs, 1000, [{ id: 'L', color: '#f00', features }], [
    { id: 'w1', name: 'near wp', lat: 43.6, lon: 105.852, alt: null },
    { id: 'w2', name: 'far wp', lat: 44, lon: 105.85, alt: 1600 },
  ], { id: 'w2', name: 'far wp', lat: 44, lon: 105.85, alt: 1600 });

  assert.equal(s.lines.length, 2);
  const crest = s.lines.find((l) => l.key === 'L-0')!;
  close(crest.pts[0][2], 1480 - 1501.5, 0.01); // 21.5 m below eye level (+ tiny curvature)
  const road = s.lines.find((l) => l.key === 'L-1')!;
  close(road.pts[0][2], -1.5, 0.01); // ground level = 1.5 m below the eye
  assert.ok(s.points.some((p) => p.label === 'BM-1'));
  assert.ok(s.points.some((p) => p.label === 'near wp' && p.kind === 'waypoint'));
  const target = s.points.find((p) => p.kind === 'target')!;
  assert.equal(target.label, 'far wp', 'target shown even outside the radius');
  assert.equal(s.points.filter((p) => p.label === 'far wp').length, 1, 'not duplicated as a waypoint');
});
