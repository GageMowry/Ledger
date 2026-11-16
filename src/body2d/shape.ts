import { ellipseRadii, type BodyParams } from './params'

/**
 * Front-view figure geometry, in inches, driven by BodyParams.
 * Body coordinates: x = 0 is the center line (+x is the figure's left, the
 * viewer's right), y = height above the floor. Output is in SVG coordinates
 * (y flipped so the floor sits at FLOOR).
 */

export const FLOOR = 72
type P = [number, number]

export interface RingGuide {
  kind: 'ring'
  cx: number
  cy: number
  rx: number
  ry: number
  rot: number // degrees, SVG rotation
}
export interface PathGuide {
  kind: 'path'
  pts: P[] // SVG coords
  ticks: boolean
}
export type GuideGeom = (RingGuide | PathGuide) & { anchor: P }

export interface FigureShape {
  parts: string[] // closed silhouette pieces, back to front
  details: string[] // interior anatomy lines
  contours: string[] // outline-weight edges inside the silhouette (arm over torso)
  ears: { cx: number; cy: number }[]
  navel: P
  guides: Record<string, GuideGeom>
  headTop: number
}

const sv = ([x, y]: P): P => [x, FLOOR - y]
const r2 = (n: number) => Math.round(n * 100) / 100

/** Catmull-Rom spline through points, as cubic Béziers. Points in SVG coords. */
export function smoothPath(pts: P[], closed: boolean): string {
  const n = pts.length
  const at = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))])
  let d = `M${r2(pts[0][0])} ${r2(pts[0][1])}`
  const segs = closed ? n : n - 1
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1)
    const p1 = at(i)
    const p2 = at(i + 1)
    const p3 = at(i + 2)
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${r2(c1[0])} ${r2(c1[1])} ${r2(c2[0])} ${r2(c2[1])} ${r2(p2[0])} ${r2(p2[1])}`
  }
  return closed ? d + ' Z' : d
}

const body = (pts: P[], closed = true) => smoothPath(pts.map(sv), closed)
const mirror = (pts: P[]): P[] => pts.map(([x, y]) => [-x, y] as P)

export function buildFigure(p: BodyParams): FigureShape {
  const H = p.height
  const rx = (circ: number, k: number) => ellipseRadii(circ, k).rx
  const rz = (circ: number, k: number) => ellipseRadii(circ, k).rz

  // ---- Landmarks (height above floor) ----
  const yTop = H
  const yChin = H * 0.871
  const yNeckBase = H * 0.835
  const yShoulder = H * 0.815
  const yArmpit = H * 0.752
  const yChest = H * 0.72
  const yCrotch = p.inseam + 0.5
  const yWaist = Math.max(p.outseam, yCrotch + 6)
  const yStomach = yWaist + 2.5
  const ySeat = yCrotch + (yWaist - yCrotch) * 0.42
  const yKnee = H * 0.285
  const yCalf = H * 0.205
  const yAnkle = 3.4

  // ---- Half-widths seen from the front ----
  const neckH = rx(p.neck, 0.92)
  const shH = p.shoulders / 2
  // Chest circumference wraps around the lats, which sit behind the arms from
  // the front, so the visible chest is narrower than the ellipse suggests.
  const chestH = rx(p.chest, 0.68) * 0.87
  const stomachH = rx(p.stomach, 0.74)
  const waistH = rx(p.waist, 0.75)
  const seatH = rx(p.seat, 0.78)
  const ribsH = (chestH + stomachH) / 2 + 0.1
  const thighH = rx(p.thigh, 0.95)
  const kneeH = rx(p.thigh * 0.63, 0.95)
  const calfH = rx(p.thigh * 0.67, 0.95)
  const ankleH = rx(p.thigh * 0.4, 0.9)
  const bicepH = rx(p.bicep, 0.92)
  const deltH = rx(p.bicep * 1.12, 0.95)
  const elbowH = rx(p.bicep * 0.76, 0.9)
  const forearmH = rx(p.bicep * 0.86, 0.85)
  // Palm faces the thigh, so from the front we see the wrist's thinner side.
  const wristH = rz(p.wrist, 0.7) * 1.1

  const parts: string[] = []
  const details: string[] = []
  const contours: string[] = []
  const guides: Record<string, GuideGeom> = {}

  // ---- Legs: center line drifts from the hip joint toward the ankles ----
  const cxHip = Math.max(2.4, seatH - thighH)
  const cxAt = (y: number) => {
    const stops: P[] = [
      [ySeat, cxHip],
      [yCrotch - 1, cxHip],
      [yKnee, Math.max(3.05, kneeH + 0.75)],
      [yCalf, Math.max(3.3, calfH + 0.75)],
      [yAnkle, 3.4],
    ]
    if (y >= stops[0][0]) return stops[0][1]
    for (let i = 0; i < stops.length - 1; i++) {
      const [ya, xa] = stops[i]
      const [yb, xb] = stops[i + 1]
      if (y <= ya && y >= yb) return xa + ((xb - xa) * (ya - y)) / (ya - yb)
    }
    return stops[stops.length - 1][1]
  }
  const yMidThigh = (yCrotch + yKnee) / 2
  const o = (y: number, half: number): P => [cxAt(y) + half, y]
  const i_ = (y: number, half: number): P => [cxAt(y) - half, y]
  const legOuter: P[] = [
    [seatH, ySeat],
    o(yCrotch - 0.5, thighH * 1.02),
    o(yCrotch - 4, thighH * 0.96), // outer quad
    o(yMidThigh, thighH * 0.82),
    o(yKnee + 2.5, kneeH * 1.1),
    o(yKnee, kneeH * 0.98),
    o(yKnee - 1.6, kneeH * 1.0),
    o(yCalf + 1.4, calfH * 1.02), // outer calf
    o(yCalf - 3, calfH * 0.86),
    o(yAnkle + 3, ankleH * 1.12),
    o(yAnkle + 0.8, ankleH),
    o(yAnkle - 0.6, ankleH * 0.95),
  ]
  const legInner: P[] = [
    i_(yAnkle - 0.6, ankleH * 0.95),
    i_(yAnkle + 0.8, ankleH * 1.05), // inner ankle bone
    i_(yAnkle + 3, ankleH * 1.2),
    i_(yCalf - 1.6, calfH * 0.92),
    i_(yCalf + 1.9, calfH * 1.0), // inner calf sits higher
    i_(yKnee - 1.1, kneeH * 0.94),
    i_(yKnee + 0.9, kneeH * 0.98),
    i_(yKnee + 3.4, kneeH * 1.12), // teardrop above the knee
    i_(yMidThigh + 1, thighH * 0.86),
    i_(yCrotch - 2, thighH * 0.98),
    [0.15, yCrotch + 0.1],
    [cxHip, ySeat + 1.5],
  ]
  const leg = [...legOuter, ...legInner]
  for (const s of [-1, 1]) {
    const pts = leg.map(([x, y]) => [x * s, y] as P)
    parts.push(body(pts))
    // Foot: short, slightly turned-out wedge under the ankle.
    const cx = cxAt(yAnkle)
    const foot: P[] = [
      [cx - ankleH * 0.92, yAnkle - 0.3],
      [cx - ankleH * 1.02, 1.5],
      [cx - ankleH * 0.85, 0.35],
      [cx - 0.1, 0],
      [cx + ankleH + 0.55, 0.05],
      [cx + ankleH + 0.95, 0.5],
      [cx + ankleH * 1.05 + 0.3, 1.3],
      [cx + ankleH * 0.95, yAnkle - 0.3],
    ]
    parts.push(body(foot.map(([x, y]) => [x * s, y] as P)))
  }

  // ---- Torso ----
  const torsoRight: P[] = [
    [neckH * 0.85, yNeckBase - 0.2],
    [neckH + (shH - neckH) * 0.45, yShoulder - 0.05], // trapezius slope
    [shH - 1.4, yShoulder - 0.25],
    [chestH + 0.45, yArmpit],
    [chestH, yChest],
    [ribsH, (yChest + yStomach) / 2],
    [stomachH, yStomach],
    [waistH, yWaist],
    [seatH, ySeat],
    [seatH * 0.88, yCrotch + 1],
    [1.3, yCrotch - 0.5],
  ]
  parts.push(body([[0, yCrotch - 0.8], ...mirror(torsoRight).reverse(), [0, yNeckBase - 0.1], ...torsoRight]))

  // ---- Arms ----
  // Shirt sleeve is measured from the center back of the neck, so the arm
  // itself (shoulder point to wrist) is roughly sleeve minus half the shoulders.
  const A = Math.min(28, Math.max(20, p.sleeve - shH))
  const U = A * 0.56 // shoulder to elbow
  const F = A - U // elbow to wrist
  const tiltU = 0.075 // upper arm hangs almost straight
  const tiltF = 0.2 // forearm angles out a little more (carrying angle)
  for (const s of [-1, 1]) {
    const J: P = [s * (shH - deltH * 0.72), yShoulder - 1.35]
    const frame = (origin: P, tilt: number) => {
      const d: P = [s * Math.sin(tilt), -Math.cos(tilt)]
      const n: P = [s * Math.cos(tilt), Math.sin(tilt)] // away from the body
      return (t: number, w: number): P => [origin[0] + d[0] * t + n[0] * w, origin[1] + d[1] * t + n[1] * w]
    }
    const up = frame(J, tiltU)
    const E = up(U, 0)
    const fo = frame(E, tiltF)
    const W = fo(F, 0)
    const hd = frame(W, tiltF - 0.04)

    // Outer contour: deltoid cap, deltoid dip, triceps, elbow, forearm, wrist.
    const outer: P[] = [
      up(-1.2, deltH * 0.15),
      up(-0.95, deltH * 0.6),
      up(-0.3, deltH * 0.92),
      up(0.9, deltH * 1.02),
      up(2.6, deltH * 0.97),
      up(U * 0.43, bicepH * 0.86), // deltoid insertion
      up(U * 0.66, bicepH * 0.95), // triceps
      up(U * 0.92, elbowH * 1.05),
      fo(0.2, elbowH * 1.02),
      fo(F * 0.2, forearmH * 1.06), // brachioradialis
      fo(F * 0.48, forearmH * 0.92),
      fo(F * 0.8, (forearmH + wristH) / 2 * 0.92),
      fo(F, wristH),
    ]
    // Hand, palm toward the thigh: fingers taper, thumb sits forward.
    const hand: P[] = [
      hd(0.9, wristH * 1.1),
      hd(2.9, wristH * 1.22), // back of the hand
      hd(3.9, wristH * 1.16), // knuckles
      hd(5.3, wristH * 0.85),
      hd(6.3, wristH * 0.2),
      hd(6.45, -wristH * 0.3), // fingertips curl toward the thigh
      hd(5.9, -wristH * 0.72),
      hd(4.7, -wristH * 0.98),
      hd(4.05, -wristH * 1.08),
      hd(3.2, -wristH * 1.42), // thumb tip
      hd(1.9, -wristH * 1.38),
      hd(0.8, -wristH * 1.05),
    ]
    // Inner contour back up: forearm flexors, inner elbow, biceps, armpit.
    const inner: P[] = [
      fo(F, -wristH),
      fo(F * 0.72, -forearmH * 0.78),
      fo(F * 0.3, -forearmH * 1.0), // flexor bulge
      fo(0.4, -elbowH * 0.95),
      up(U * 0.9, -elbowH * 0.98),
      up(U * 0.62, -bicepH * 1.03), // biceps
      up(U * 0.35, -bicepH * 0.93),
      up(2.2, -deltH * 0.8), // armpit
      up(0, -deltH * 0.7),
      up(-1.0, -deltH * 0.3),
    ]
    parts.push(body([...outer, ...hand, ...inner]))

    // Edge of the arm where it lies in front of the torso.
    contours.push(body([up(2.6, -deltH * 0.78), up(U * 0.35, -bicepH * 0.93), up(U * 0.62, -bicepH * 1.03), up(U * 0.9, -elbowH * 0.98)], false))

    // Anatomy: front border of the deltoid, biceps groove, elbow crease, thumb.
    details.push(body([up(-0.9, -deltH * 0.45), up(1.4, -deltH * 0.05), up(U * 0.43, bicepH * 0.55)], false))
    details.push(body([fo(-0.2, -elbowH * 0.6), fo(0.35, -elbowH * 0.1)], false))
    // Thumb edge, then the folds between curled fingers.
    contours.push(body([hd(1.4, -wristH * 0.6), hd(2.6, -wristH * 0.85), hd(3.6, -wristH * 1.15)], false))
    details.push(body([hd(3.9, wristH * 0.55), hd(4.6, wristH * 0.1), hd(5.2, -wristH * 0.4)], false))
    details.push(body([hd(4.7, wristH * 0.7), hd(5.35, wristH * 0.2), hd(5.8, -wristH * 0.35)], false))

    if (s === 1) {
      // Right arm (viewer's right) carries the arm guides.
      const bc = sv(up(U * 0.58, 0))
      guides.bicep = {
        kind: 'ring',
        cx: bc[0],
        cy: bc[1],
        rx: bicepH + 0.25,
        ry: rz(p.bicep, 0.92) * 0.3,
        rot: (-s * tiltU * 180) / Math.PI,
        anchor: sv(up(U * 0.58, bicepH + 0.3)),
      }
      const wc = sv(fo(F - 0.5, 0))
      guides.wrist = {
        kind: 'ring',
        cx: wc[0],
        cy: wc[1],
        rx: wristH + 0.22,
        ry: rz(p.wrist, 0.7) * 0.35,
        rot: (-s * tiltF * 180) / Math.PI,
        anchor: sv(fo(F - 0.5, wristH + 0.3)),
      }
      // Sleeve: center back of the neck, over the shoulder, down the outside of the arm.
      const sleevePts: P[] = [
        sv([0, yNeckBase + 0.3]),
        sv([shH * 0.55, yShoulder + 0.45]),
        sv(up(-1.2, deltH * 0.75)),
        sv(up(1.2, deltH * 1.02 + 0.6)),
        sv(up(U * 0.5, bicepH * 0.95 + 0.6)),
        sv(up(U, elbowH * 1.05 + 0.6)),
        sv(fo(F * 0.4, forearmH * 0.98 + 0.6)),
        sv(fo(F, wristH + 0.6)),
      ]
      guides.sleeve = { kind: 'path', pts: sleevePts, ticks: true, anchor: sleevePts[5] }
    }
  }

  // ---- Neck and head ----
  parts.push(
    body([
      [-neckH * 0.95, yNeckBase - 1.6],
      [-neckH * 1.0, yNeckBase + 0.2],
      [-neckH * 0.97, yNeckBase + 1.4],
      [-neckH * 0.86, yChin + 0.6],
      [neckH * 0.86, yChin + 0.6],
      [neckH * 0.97, yNeckBase + 1.4],
      [neckH * 1.0, yNeckBase + 0.2],
      [neckH * 0.95, yNeckBase - 1.6],
    ]),
  )
  const headR: P[] = [
    [2.2, yTop - 0.55],
    [2.95, yTop - 2.0],
    [3.08, yTop - 4.0],
    [3.0, yTop - 5.7],
    [2.8, yTop - 7.1], // jaw angle
    [2.15, yTop - 8.35],
    [1.05, yChin + 0.1],
  ]
  parts.push(body([[0, yTop], ...headR, [0, yChin], ...mirror(headR).reverse()]))
  const ears = [-1, 1].map((s) => ({ cx: s * 3.1, cy: FLOOR - (yTop - 4.6) }))

  // ---- Torso details ----
  for (const s of [-1, 1]) {
    // Collarbone
    details.push(body([[s * neckH * 0.9, yNeckBase - 0.85], [s * shH * 0.45, yNeckBase - 1.15], [s * (shH - 1.7), yShoulder + 0.05]], false))
    // Pec underline
    details.push(
      body([[s * 0.35, yChest - 0.6], [s * chestH * 0.48, yChest - 1.45], [s * chestH * 0.86, yChest - 0.5], [s * (chestH - 0.15), yChest + 1.3]], false),
    )
    // Hip "V" lines
    details.push(body([[s * waistH * 0.74, yWaist - 0.2], [s * waistH * 0.48, yWaist - 2], [s * 1.25, yCrotch + 1.6]], false))
    // Oblique / side line under the pec
    details.push(body([[s * (ribsH - 0.7), (yChest + yStomach) / 2 + 1.6], [s * (stomachH - 0.9), yStomach + 0.4]], false))
    // Kneecap: soft rounded outline, open at the top
    const kx = cxAt(yKnee) * s
    const kw = kneeH * 0.42
    details.push(
      body(
        [
          [kx - kw, yKnee + 1.1],
          [kx - kw * 1.05, yKnee - 0.1],
          [kx - kw * 0.5, yKnee - 0.95],
          [kx + kw * 0.5, yKnee - 0.95],
          [kx + kw * 1.05, yKnee - 0.1],
          [kx + kw, yKnee + 1.1],
        ],
        false,
      ),
    )
    // Quad teardrop above the inner knee
    details.push(body([[s * (cxAt(yKnee + 5) - kneeH * 0.7), yKnee + 5], [s * (cxAt(yKnee + 2) - kneeH * 0.55), yKnee + 1.8], [kx - s * kw * 0.2, yKnee + 1.3]], false))
    // Shin: gentle curve down the front of the lower leg
    details.push(body([[s * (cxAt(yKnee - 2.2) - 0.2), yKnee - 2.2], [s * (cxAt(yCalf) - 0.45), yCalf], [s * (cxAt(yAnkle + 4) - 0.35), yAnkle + 4]], false))
    // Toe line
    const fx = cxAt(yAnkle) * s
    details.push(body([[fx - s * 0.2, 0.9], [fx + s * (ankleH + 0.4), 0.85]], false))
    // Neck tendon (sternocleidomastoid), ear to collarbone notch
    details.push(body([[s * neckH * 0.78, yChin + 0.3], [s * neckH * 0.45, yNeckBase + 0.3], [s * 0.55, yNeckBase - 0.75]], false))
  }
  details.push(body([[0, yNeckBase - 1.4], [0, yChest - 0.8]], false)) // sternum
  details.push(body([[0, yChest - 2.6], [0, yStomach + 0.9]], false)) // linea alba
  details.push(body([[0, yCrotch + 0.1], [0, yCrotch - 2.6]], false)) // where the thighs meet

  // ---- Torso guides ----
  const ring = (key: string, y: number, half: number, depth: number) => {
    const [cx, cy] = sv([0, y])
    guides[key] = { kind: 'ring', cx, cy, rx: half + 0.3, ry: depth * 0.22, rot: 0, anchor: sv([half + 0.35, y]) }
  }
  ring('neck', yNeckBase + 1.1, neckH * 0.98, rz(p.neck, 0.92))
  ring('chest', yChest, chestH, rz(p.chest, 0.68))
  ring('stomach', yStomach, stomachH, rz(p.stomach, 0.74))
  ring('waist', yWaist, waistH, rz(p.waist, 0.75))
  ring('seat', ySeat, seatH, rz(p.seat, 0.78))
  {
    // Thigh ring on the right leg, tilted with the leg.
    const y = yCrotch - 1.3
    const cx = cxAt(y)
    const legTilt = Math.atan2(cxAt(yAnkle) - cxHip, ySeat - yAnkle)
    const [sx, sy] = sv([cx, y])
    guides.thigh = {
      kind: 'ring',
      cx: sx,
      cy: sy,
      rx: thighH + 0.25,
      ry: rz(p.thigh, 0.95) * 0.26,
      rot: (-legTilt * 180) / Math.PI,
      anchor: sv([cx + thighH + 0.3, y]),
    }
  }
  {
    const y = yShoulder + 1.0
    const pts: P[] = [sv([-shH, y]), sv([0, y]), sv([shH, y])]
    guides.shoulders = { kind: 'path', pts, ticks: true, anchor: pts[2] }
  }
  {
    const pts: P[] = [sv([0, yNeckBase]), sv([0, yNeckBase - p.jacketLength])]
    guides.jacketLength = { kind: 'path', pts, ticks: true, anchor: sv([0.4, yNeckBase - p.jacketLength * 0.5]) }
  }
  {
    // Inseam: down the inside of the right leg, crotch to the hem.
    const ys = [yCrotch - 0.2, yCrotch - 3, yMidThigh, yKnee, yCalf, yAnkle, 0.9]
    const pts = ys.map((y) => {
      const half = y > yMidThigh ? thighH * 0.9 : y > yKnee - 2 ? kneeH : y > yAnkle + 2 ? calfH * 0.9 : ankleH
      return sv([Math.max(0.35, cxAt(y) - half - 0.5), y])
    })
    guides.inseam = { kind: 'path', pts, ticks: true, anchor: pts[3] }
  }
  {
    // Outseam: from the waistband down the outside of the right leg.
    const pts: P[] = [
      sv([waistH + 0.6, yWaist]),
      sv([seatH + 0.6, ySeat]),
      sv([cxAt(yMidThigh) + thighH * 0.87 + 0.6, yMidThigh]),
      sv([cxAt(yKnee) + kneeH + 0.6, yKnee]),
      sv([cxAt(yCalf) + calfH + 0.6, yCalf]),
      sv([cxAt(yAnkle) + ankleH + 0.6, yAnkle]),
      sv([cxAt(yAnkle) + ankleH + 0.6, 0.9]),
    ]
    guides.outseam = { kind: 'path', pts, ticks: true, anchor: pts[3] }
  }

  return {
    parts,
    details,
    contours,
    ears,
    navel: sv([0, yStomach - 0.2]),
    guides,
    headTop: FLOOR - yTop,
  }
}
