import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildBody, type BuiltBody, type Materials } from './build'
import { lerpParams, paramsDistance, toParams, type BodyParams } from './params'

export interface Body3DProps {
  values: Record<string, number | undefined>
  /** Optional earlier snapshot drawn as a see-through ghost. */
  ghostValues?: Record<string, number | undefined> | null
  selected: string
  onSelect: (key: string) => void
  label: { title: string; value: string }
  onFallback: () => void
}

const VIEW_THETA = { front: 0, side: Math.PI / 2, back: Math.PI } as const
const TARGET = new THREE.Vector3(0, 36, 0)

function themeColors(dark: boolean) {
  return dark
    ? { skin: 0x64748b, guide: 0x94a3b8, active: 0x818cf8, ghost: 0xa5b4fc }
    : { skin: 0xcbd5e1, guide: 0x64748b, active: 0x4f46e5, ghost: 0x6366f1 }
}

/** Shortest signed angle from a to b. */
function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a))
}

export default function Body3D({ values, ghostValues, selected, onSelect, label, onFallback }: Body3DProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const api = useRef<{
    setTarget: (p: BodyParams) => void
    setGhost: (p: BodyParams | null) => void
    select: (key: string, focus: boolean) => void
    resetView: () => void
  } | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onFallbackRef = useRef(onFallback)
  onFallbackRef.current = onFallback

  // ---- One-time scene setup ----
  useEffect(() => {
    const wrap = wrapRef.current!
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      onFallbackRef.current()
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    wrap.prepend(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'
    renderer.domElement.style.display = 'block'

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000)
    camera.position.set(0, 38, 168)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(TARGET)
    controls.enablePan = false
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 70
    controls.maxDistance = 220
    controls.minPolarAngle = Math.PI * 0.3
    controls.maxPolarAngle = Math.PI * 0.62
    controls.update()

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8090a0, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(60, 120, 120)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffffff, 0.9)
    rim.position.set(-80, 60, -100)
    scene.add(rim)

    // Floor shadow disc
    const floorGeo = new THREE.CircleGeometry(16, 48)
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.08, depthWrite: false })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.05
    scene.add(floor)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let colors = themeColors(media.matches)
    const mats: Materials = {
      skin: new THREE.MeshStandardMaterial({ color: colors.skin, roughness: 0.55, metalness: 0.05 }),
      guide: new THREE.MeshBasicMaterial({ color: colors.guide, transparent: true, opacity: 0.22, depthWrite: false }),
      guideActive: new THREE.MeshBasicMaterial({ color: colors.active, depthTest: false }),
      hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    }
    const ghostMat = new THREE.MeshStandardMaterial({
      color: colors.ghost,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      roughness: 0.6,
    })
    const ghostMats: Materials = { ...mats, skin: ghostMat }

    const applyTheme = () => {
      colors = themeColors(media.matches)
      ;(mats.skin as THREE.MeshStandardMaterial).color.setHex(colors.skin)
      mats.guide.color.setHex(colors.guide)
      mats.guideActive.color.setHex(colors.active)
      ghostMat.color.setHex(colors.ghost)
    }
    media.addEventListener('change', applyTheme)

    let current: BodyParams | null = null
    let target: BodyParams | null = null
    let built: BuiltBody | null = null
    let ghost: BuiltBody | null = null
    let selectedKey = ''
    let focusTheta: number | null = null

    const rebuild = () => {
      if (!current) return
      built?.dispose()
      if (built) scene.remove(built.group)
      built = buildBody(current, mats, { guides: true })
      scene.add(built.group)
      highlight()
    }

    const highlight = () => {
      if (!built) return
      for (const g of Object.values(built.guides)) {
        const active = g.key === selectedKey
        g.visual.material = active ? mats.guideActive : mats.guide
        g.visual.scale.setScalar(1)
        g.visual.renderOrder = active ? 3 : 2
      }
    }

    api.current = {
      setTarget: (p) => {
        target = p
        if (!current) {
          current = p
          rebuild()
        }
      },
      setGhost: (p) => {
        ghost?.dispose()
        if (ghost) scene.remove(ghost.group)
        ghost = null
        if (p) {
          ghost = buildBody(p, ghostMats, { guides: false })
          ghost.body.forEach((m) => (m.renderOrder = 1))
          scene.add(ghost.group)
        }
      },
      select: (k, focus) => {
        selectedKey = k
        highlight()
        const view = built?.guides[k]?.view
        if (focus && view) focusTheta = VIEW_THETA[view]
      },
      resetView: () => {
        focusTheta = 0
      },
    }

    if (import.meta.env.DEV) {
      // Test hook: screen position of a guide's label anchor.
      ;(window as unknown as Record<string, unknown>).__body3dScreenPos = (k: string) => {
        const g = built?.guides[k]
        if (!g) return null
        const v = g.anchor.getWorldPosition(new THREE.Vector3()).project(camera)
        const rect = renderer.domElement.getBoundingClientRect()
        return [rect.left + ((v.x + 1) / 2) * rect.width, rect.top + ((1 - v.y) / 2) * rect.height]
      }
    }

    controls.addEventListener('start', () => {
      focusTheta = null
    })

    // ---- Tap to select (ignore drags) ----
    const raycaster = new THREE.Raycaster()
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (!down || !built) return
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
      down = null
      if (moved > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const targets = [...built.body, ...Object.values(built.guides).map((g) => g.hit)]
      const hit = raycaster.intersectObjects(targets, false)[0]
      const k = hit?.object.userData.guideKey as string | undefined
      if (k) onSelectRef.current(k)
    }
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    // ---- Size ----
    const resize = () => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = `${w}px`
      renderer.domElement.style.height = `${h}px`
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    resize()

    // ---- Loop ----
    const sph = new THREE.Spherical()
    const offset = new THREE.Vector3()
    const proj = new THREE.Vector3()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)

      if (current && target && paramsDistance(current, target) > 0.01) {
        current = lerpParams(current, target, 0.14)
        rebuild()
      }

      if (focusTheta !== null) {
        offset.copy(camera.position).sub(controls.target)
        sph.setFromVector3(offset)
        const d = angleDelta(sph.theta, focusTheta)
        if (Math.abs(d) < 0.003) focusTheta = null
        else {
          sph.theta += d * 0.1
          offset.setFromSpherical(sph)
          camera.position.copy(controls.target).add(offset)
        }
      }
      controls.update()

      // Pulse the selected guide slightly.
      const sel = built?.guides[selectedKey]
      if (sel) sel.visual.scale.setScalar(1 + Math.sin(performance.now() / 260) * 0.012)

      renderer.render(scene, camera)

      // Floating label follows the selected guide.
      const el = labelRef.current
      if (el) {
        if (sel) {
          sel.anchor.getWorldPosition(proj)
          proj.project(camera)
          const visible = proj.z < 1
          const x = ((proj.x + 1) / 2) * wrap.clientWidth
          const y = ((1 - proj.y) / 2) * wrap.clientHeight
          el.style.opacity = visible ? '1' : '0'
          el.style.transform = `translate(${Math.round(Math.min(Math.max(x + 10, 8), wrap.clientWidth - el.offsetWidth - 8))}px, ${Math.round(y - el.offsetHeight / 2)}px)`
        } else el.style.opacity = '0'
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      media.removeEventListener('change', applyTheme)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      controls.dispose()
      built?.dispose()
      ghost?.dispose()
      floorGeo.dispose()
      floorMat.dispose()
      ;[mats.skin, mats.guide, mats.guideActive, mats.hit, ghostMat].forEach((m) => m.dispose())
      renderer.dispose()
      renderer.domElement.remove()
      api.current = null
    }
  }, [])

  // ---- Prop sync ----
  const valuesKey = JSON.stringify(values)
  useEffect(() => {
    api.current?.setTarget(toParams(values))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuesKey])

  const ghostKey = JSON.stringify(ghostValues ?? null)
  useEffect(() => {
    api.current?.setGhost(ghostValues ? toParams(ghostValues) : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostKey])

  const firstSelect = useRef(true)
  useEffect(() => {
    api.current?.select(selected, !firstSelect.current)
    firstSelect.current = false
  }, [selected])

  return (
    <div ref={wrapRef} className="relative h-[440px] w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
      <div
        ref={labelRef}
        className="pointer-events-none absolute top-0 left-0 rounded-lg bg-slate-900/90 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow transition-opacity dark:bg-white/90 dark:text-slate-900"
      >
        <span className="font-semibold">{label.title}</span> <span className="tabular-nums">{label.value}</span>
      </div>
      <div className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-slate-400">Drag to rotate · pinch to zoom · tap a ring</div>
      <button
        type="button"
        onClick={() => api.current?.resetView()}
        className="absolute right-2 bottom-2 rounded-lg bg-white/80 px-2 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800/80 dark:text-slate-300"
      >
        Front
      </button>
    </div>
  )
}
