import * as THREE from 'three'
import { ellipseRadii, type BodyParams } from './params'

/**
 * Builds a mannequin out of lofted elliptical cross-sections, sized in inches
 * from BodyParams. Front of the body faces +z, floor is y = 0.
 *
 * Every measurement gets a guide: a thin tube (tape ring for circumferences,
 * path for lengths) plus a fat invisible tube used for tap hit-testing.
 */

interface Ring {
  y: number
  rx: number
  rz: number
  cz?: number
}

export interface Guide {
  key: string
  visual: THREE.Mesh
  hit: THREE.Mesh
  anchor: THREE.Object3D // where the floating label points
  view: 'front' | 'back' | 'side'
}

export interface BuiltBody {
  group: THREE.Group
  body: THREE.Mesh[]
  guides: Record<string, Guide>
  dispose: () => void
}

export interface Materials {
  skin: THREE.Material
  guide: THREE.MeshBasicMaterial
  guideActive: THREE.MeshBasicMaterial
  hit: THREE.Material
}

const SEG = 48

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

/** Smoothly interpolates between control rings so the surface has no kinks. */
function smooth(rings: Ring[], sub = 6): Ring[] {
  const out: Ring[] = []
  const at = (i: number) => rings[Math.max(0, Math.min(rings.length - 1, i))]
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sub; s++) {
      const t = s / sub
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
      out.push({
        y: catmull(a.y, b.y, c.y, d.y, t),
        rx: Math.max(0.01, catmull(a.rx, b.rx, c.rx, d.rx, t)),
        rz: Math.max(0.01, catmull(a.rz, b.rz, c.rz, d.rz, t)),
        cz: catmull(a.cz ?? 0, b.cz ?? 0, c.cz ?? 0, d.cz ?? 0, t),
      })
    }
  }
  out.push(rings[rings.length - 1])
  return out
}

/** Surface through a stack of rings, closed at both ends. */
function loft(control: Ring[]): THREE.BufferGeometry {
  const rings = smooth(control)
  const pos: number[] = []
  const idx: number[] = []
  for (const r of rings) {
    for (let j = 0; j < SEG; j++) {
      const a = (j / SEG) * Math.PI * 2
      pos.push(r.rx * Math.cos(a), r.y, (r.cz ?? 0) + r.rz * Math.sin(a))
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEG; j++) {
      const a = i * SEG + j
      const b = i * SEG + ((j + 1) % SEG)
      const c = a + SEG
      const d = b + SEG
      idx.push(a, c, b, b, c, d)
    }
  }
  // End caps: a center point fanned to the first/last ring.
  const first = rings[0]
  const last = rings[rings.length - 1]
  const c0 = pos.length / 3
  pos.push(0, first.y, first.cz ?? 0)
  const c1 = pos.length / 3
  pos.push(0, last.y, last.cz ?? 0)
  const lastBase = (rings.length - 1) * SEG
  for (let j = 0; j < SEG; j++) {
    const jn = (j + 1) % SEG
    idx.push(c0, j, jn)
    idx.push(c1, lastBase + jn, lastBase + j)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

function ring(y: number, circ: number, k: number, cz = 0): Ring {
  return { y, ...ellipseRadii(circ, k), cz }
}

/** Linear lookup of a ring's size at height y within a control stack. */
function ringAt(rings: Ring[], y: number): Ring {
  const sorted = [...rings].sort((a, b) => a.y - b.y)
  if (y <= sorted[0].y) return sorted[0]
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1)
      return { y, rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t, cz: (a.cz ?? 0) + ((b.cz ?? 0) - (a.cz ?? 0)) * t }
    }
  }
  return sorted[sorted.length - 1]
}

function ellipseCurve(r: Ring, inflate = 0.35): THREE.Curve<THREE.Vector3> {
  const pts: THREE.Vector3[] = []
  for (let j = 0; j < 64; j++) {
    const a = (j / 64) * Math.PI * 2
    pts.push(new THREE.Vector3((r.rx + inflate) * Math.cos(a), r.y, (r.cz ?? 0) + (r.rz + inflate) * Math.sin(a)))
  }
  return new THREE.CatmullRomCurve3(pts, true)
}

function pathCurve(points: [number, number, number][]): THREE.Curve<THREE.Vector3> {
  return new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
}

export function buildBody(p: BodyParams, mats: Materials, opts: { guides: boolean }): BuiltBody {
  const group = new THREE.Group()
  const body: THREE.Mesh[] = []
  const guides: Record<string, Guide> = {}
  const geometries: THREE.BufferGeometry[] = []

  const addBody = (geo: THREE.BufferGeometry, parent: THREE.Object3D = group) => {
    geometries.push(geo)
    const m = new THREE.Mesh(geo, mats.skin)
    parent.add(m)
    body.push(m)
    return m
  }

  const addGuide = (
    key: string,
    curve: THREE.Curve<THREE.Vector3>,
    closed: boolean,
    anchorAt: THREE.Vector3,
    view: Guide['view'],
    parent: THREE.Object3D = group,
  ) => {
    if (!opts.guides) return
    const tubular = closed ? 96 : 48
    const vGeo = new THREE.TubeGeometry(curve, tubular, 0.16, 8, closed)
    const hGeo = new THREE.TubeGeometry(curve, tubular, 2, 6, closed)
    geometries.push(vGeo, hGeo)
    const visual = new THREE.Mesh(vGeo, mats.guide)
    visual.renderOrder = 2
    const hit = new THREE.Mesh(hGeo, mats.hit)
    hit.userData.guideKey = key
    const anchor = new THREE.Object3D()
    anchor.position.copy(anchorAt)
    parent.add(visual, hit, anchor)
    guides[key] = { key, visual, hit, anchor, view }
  }

  // ---- Vertical landmarks (inches from the floor) ----
  const H = p.height
  const yCrotch = p.inseam + 0.5
  const yWaist = Math.max(p.outseam, yCrotch + 6)
  const ySeat = yCrotch + (yWaist - yCrotch) * 0.42
  const yStomach = yWaist + 3
  const yChest = H * 0.72
  const yShoulder = H * 0.815
  const yNeckBase = H * 0.835
  const yChin = H * 0.875
  const yHead = H * 0.935

  // ---- Torso ----
  const chest = ring(yChest, p.chest, 0.66)
  const halfShoulder = p.shoulders / 2
  const neckR = ellipseRadii(p.neck, 0.92)
  const torso: Ring[] = [
    { y: yCrotch - 1.6, rx: 0.4, rz: 0.4, cz: -0.2 },
    ring(yCrotch - 0.9, p.seat * 0.4, 0.8, -0.2),
    ring(yCrotch + 0.2, p.seat * 0.72, 0.78, -0.4),
    ring(yCrotch + 1.6, p.seat * 0.94, 0.78, -0.5),
    ring(ySeat, p.seat, 0.78, -0.6),
    ring(yWaist, p.waist, 0.72, -0.2),
    ring(yStomach, p.stomach, 0.72, 0.15),
    ring((yStomach + yChest) / 2, (p.stomach + p.chest) / 2 * 0.97, 0.7, 0.1),
    { ...chest, cz: 0.2 },
    { y: yChest + 2.4, rx: Math.max(chest.rx, halfShoulder - 2.2), rz: chest.rz * 0.93, cz: 0.1 },
    { y: yShoulder - 1.2, rx: halfShoulder - 1.9, rz: chest.rz * 0.75, cz: -0.2 },
    { y: yShoulder + 0.5, rx: halfShoulder * 0.62, rz: chest.rz * 0.58, cz: -0.4 },
    { y: yNeckBase, rx: neckR.rx * 1.5, rz: neckR.rz * 1.3, cz: -0.4 },
    { y: yNeckBase + 0.4, rx: neckR.rx * 1.05, rz: neckR.rz * 1.05, cz: -0.4 },
  ]
  addBody(loft(torso))

  // ---- Neck + head ----
  addBody(
    loft([
      { y: yNeckBase - 0.5, rx: neckR.rx, rz: neckR.rz, cz: -0.4 },
      { y: yNeckBase + 1, rx: neckR.rx, rz: neckR.rz, cz: -0.3 },
      { y: yChin, rx: neckR.rx * 0.92, rz: neckR.rz * 0.92, cz: -0.1 },
      { y: yChin + 1, rx: neckR.rx * 0.8, rz: neckR.rz * 0.8, cz: 0 },
    ]),
  )
  const headGeo = new THREE.SphereGeometry(1, 40, 28)
  geometries.push(headGeo)
  const head = new THREE.Mesh(headGeo, mats.skin)
  head.scale.set(3.0, 4.6, 3.7)
  head.position.set(0, yHead, 0.2)
  group.add(head)
  body.push(head)

  // ---- Torso guides ----
  const neckGuide: Ring = { y: yNeckBase + 1, rx: neckR.rx, rz: neckR.rz, cz: -0.3 }
  addGuide('neck', ellipseCurve(neckGuide, 0.25), true, new THREE.Vector3(neckR.rx + 0.4, neckGuide.y, 0), 'front')
  for (const [key, y] of [
    ['chest', yChest],
    ['stomach', yStomach],
    ['waist', yWaist],
    ['seat', ySeat],
  ] as const) {
    const r = ringAt(torso, y)
    addGuide(key, ellipseCurve(r), true, new THREE.Vector3(r.rx + 0.4, y, r.cz ?? 0), key === 'seat' ? 'side' : 'front')
  }
  {
    // Across the back, shoulder tip to shoulder tip.
    const y = yShoulder + 0.2
    const back = ringAt(torso, y)
    const z = (back.cz ?? 0) - back.rz - 0.35
    addGuide(
      'shoulders',
      pathCurve([
        [-halfShoulder, y - 0.6, z * 0.35],
        [-halfShoulder * 0.55, y, z * 0.92],
        [0, y + 0.2, z],
        [halfShoulder * 0.55, y, z * 0.92],
        [halfShoulder, y - 0.6, z * 0.35],
      ]),
      false,
      // Seen from behind, -x is on the right of the screen, so the label sits clear of the line.
      new THREE.Vector3(-halfShoulder, y - 0.6, z * 0.35),
      'back',
    )
  }
  {
    // Down the center back, collar to jacket hem.
    const pts: [number, number, number][] = []
    for (let i = 0; i <= 8; i++) {
      const y = yNeckBase - (p.jacketLength * i) / 8
      const r = ringAt(torso, y)
      pts.push([0, y, (r.cz ?? 0) - r.rz - 0.35])
    }
    addGuide('jacketLength', pathCurve(pts), false, new THREE.Vector3(...pts[8]), 'back')
  }

  // ---- Arms (built hanging along -y in local space, then tilted out) ----
  const L = p.sleeve
  const bicepR = ellipseRadii(p.bicep, 0.92)
  const wristR = ellipseRadii(p.wrist, 0.7)
  const armRings: Ring[] = [
    { y: 1.2, rx: bicepR.rx * 0.6, rz: bicepR.rz * 0.6 },
    ring(0, p.bicep * 1.28, 0.95),
    ring(-3, p.bicep * 1.12, 0.92),
    ring(-L * 0.3, p.bicep, 0.92),
    ring(-L * 0.47, p.bicep * 0.8, 0.88),
    ring(-L * 0.6, p.bicep * 0.88, 0.8),
    ring(-L, p.wrist, 0.7),
    { y: -L - 0.6, rx: wristR.rx * 0.9, rz: wristR.rz * 0.9 },
  ]
  for (const side of [-1, 1]) {
    const arm = new THREE.Group()
    arm.position.set(side * (halfShoulder - 1.7), yShoulder - 0.4, -0.3)
    arm.rotation.z = side * 0.16
    group.add(arm)
    addBody(loft(armRings), arm)

    // Rounded deltoid cap so the shoulder isn't a hard corner.
    const deltR = ellipseRadii(p.bicep * 1.18, 0.95)
    const deltGeo = new THREE.SphereGeometry(1, 28, 20)
    geometries.push(deltGeo)
    const delt = new THREE.Mesh(deltGeo, mats.skin)
    delt.scale.set(deltR.rx, deltR.rx * 1.15, deltR.rz)
    delt.position.set(side * -0.7, -0.6, 0)
    arm.add(delt)
    body.push(delt)

    const handGeo = new THREE.SphereGeometry(1, 24, 16)
    geometries.push(handGeo)
    const hand = new THREE.Mesh(handGeo, mats.skin)
    hand.scale.set(0.85, 3.6, 1.8)
    hand.position.set(0, -L - 3.3, 0.2)
    arm.add(hand)
    body.push(hand)

    if (side === 1) {
      const bicepRing = ringAt(armRings, -L * 0.3)
      addGuide('bicep', ellipseCurve(bicepRing, 0.25), true, new THREE.Vector3(bicepRing.rx + 0.4, -L * 0.3, 0), 'front', arm)
      const wristRing = ringAt(armRings, -L + 0.4)
      addGuide('wrist', ellipseCurve(wristRing, 0.2), true, new THREE.Vector3(wristRing.rx + 0.4, -L + 0.4, 0), 'front', arm)
    } else {
      // Sleeve: down the outside of the left arm.
      const pts: [number, number, number][] = []
      for (let i = 0; i <= 8; i++) {
        const y = -(L * i) / 8
        const r = ringAt(armRings, y)
        pts.push([-(r.rx + 0.35), y, 0])
      }
      addGuide('sleeve', pathCurve(pts), false, new THREE.Vector3(...pts[4]), 'front', arm)
    }
  }

  // ---- Legs ----
  const seatR = ringAt(torso, ySeat)
  const hipX = seatR.rx * 0.54
  const footX = 3.6
  const hipY = yCrotch + 2.5
  const tilt = Math.atan2(hipX - footX, hipY)
  const legLen = hipY / Math.cos(tilt)
  const legY = (worldY: number) => -(hipY - worldY) / Math.cos(tilt)
  const thighCirc = p.thigh
  const legRings: Ring[] = [
    { y: 1.5, rx: 0.8, rz: 0.8 },
    ring(0, thighCirc * 1.08, 0.95, -0.2),
    ring(legY(yCrotch - 1), thighCirc, 0.95, 0),
    ring(legY(H * 0.36), thighCirc * 0.84, 0.92, 0.2),
    ring(legY(H * 0.285), thighCirc * 0.64, 0.95, 0.2),
    ring(legY(H * 0.2), thighCirc * 0.69, 0.95, -0.4),
    ring(legY(H * 0.12), thighCirc * 0.5, 0.95, -0.1),
    ring(legY(3.2), thighCirc * 0.42, 0.9, 0),
    { y: -legLen + 1.2, rx: 1.2, rz: 1.2 },
  ]
  for (const side of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(side * hipX, hipY, 0)
    leg.rotation.z = -side * tilt
    group.add(leg)
    addBody(loft(legRings), leg)

    if (side === -1) {
      const thighRing = ringAt(legRings, legY(yCrotch - 1))
      addGuide('thigh', ellipseCurve(thighRing, 0.25), true, new THREE.Vector3(-(thighRing.rx + 0.4), thighRing.y, 0), 'front', leg)
    } else {
      // Inseam: inside of the right leg, crotch to floor.
      const inner: [number, number, number][] = []
      for (let i = 0; i <= 8; i++) {
        const y = legY(yCrotch) + ((legY(1) - legY(yCrotch)) * i) / 8
        const r = ringAt(legRings, y)
        inner.push([-(r.rx + 0.35), y, r.cz ?? 0])
      }
      addGuide('inseam', pathCurve(inner), false, new THREE.Vector3(...inner[4]), 'front', leg)

      // Outseam: waistband on the outer hip, down the outside of the leg.
      const outer: [number, number, number][] = []
      const waistR = ringAt(torso, yWaist)
      outer.push([waistR.rx + 0.35 - hipX, yWaist - hipY, 0])
      outer.push([seatR.rx + 0.35 - hipX, ySeat - hipY, 0])
      for (let i = 1; i <= 7; i++) {
        const y = legY(yCrotch) + ((legY(1) - legY(yCrotch)) * i) / 7
        const r = ringAt(legRings, y)
        outer.push([r.rx + 0.35, y, r.cz ?? 0])
      }
      addGuide('outseam', pathCurve(outer), false, new THREE.Vector3(...outer[4]), 'side', leg)
    }

    const footGeo = new THREE.SphereGeometry(1, 24, 16)
    geometries.push(footGeo)
    const foot = new THREE.Mesh(footGeo, mats.skin)
    foot.scale.set(1.8, 1.3, 5)
    foot.position.set(side * footX, 1.2, 2.2)
    group.add(foot)
    body.push(foot)
  }

  return {
    group,
    body,
    guides,
    dispose: () => geometries.forEach((g) => g.dispose()),
  }
}
