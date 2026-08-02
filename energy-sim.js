/* ============================================================
   Interactive 3D Energy Systems Showcase
   Two switchable, engineer-controllable systems:
     1. CSP  - Concentrated Solar Power tower with a tracking
               heliostat field focusing sunlight on a receiver.
     2. CVC  - Building HVAC loop (reversible heat pump + AHU +
               ducts) regulating zone temperatures.
   Built with Three.js (ES modules via CDN).
   Author: portfolio of Abdelilah El Ghazouani
   ============================================================ */

import * as THREE from "three"

/* ---------- theme colors ---------- */
const C_PRIMARY = 0x2563eb
const C_TEAL = 0x14b8a6
const C_AMBER = 0xf59e0b
const C_HOT = 0xff5a1f
const C_COLD = 0x38bdf8

const canvas = document.getElementById("sim-canvas")
if (canvas && window.WebGLRenderingContext) {
  try {
    initEnergySim(canvas)
  } catch (err) {
    console.log("[v0] Energy sim failed to init:", err && err.message)
    showFallback()
  }
}

function showFallback() {
  const stage = document.querySelector(".sim-stage")
  if (stage) stage.classList.add("sim-unsupported")
}

function initEnergySim(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = false

  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x0a1120, 0.012)

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400)
  camera.position.set(0, 16, 38)
  camera.lookAt(0, 5, 0)

  // Lighting
  const ambient = new THREE.AmbientLight(0x8899bb, 0.6)
  scene.add(ambient)
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
  keyLight.position.set(20, 30, 20)
  scene.add(keyLight)
  const fill = new THREE.DirectionalLight(0x3b82f6, 0.4)
  fill.position.set(-20, 10, -10)
  scene.add(fill)

  // Rotatable world group (shared by both scenes)
  const world = new THREE.Group()
  scene.add(world)

  const csp = buildCSP()
  const cvc = buildCVC()
  world.add(csp.group)
  world.add(cvc.group)
  cvc.group.visible = false

  /* ---------- drag-to-orbit ---------- */
  let dragging = false
  let lastX = 0
  let lastY = 0
  let targetRotY = -0.4
  let targetRotX = 0.05
  let curRotY = targetRotY
  let curRotX = targetRotX
  let idleSpin = true

  const onDown = (e) => {
    dragging = true
    idleSpin = false
    const p = pointer(e)
    lastX = p.x
    lastY = p.y
  }
  const onMove = (e) => {
    if (!dragging) return
    const p = pointer(e)
    targetRotY += (p.x - lastX) * 0.008
    targetRotX += (p.y - lastY) * 0.006
    targetRotX = Math.max(-0.25, Math.min(0.6, targetRotX))
    lastX = p.x
    lastY = p.y
  }
  const onUp = () => {
    dragging = false
  }
  const pointer = (e) => {
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX, y: t.clientY }
  }
  canvas.addEventListener("pointerdown", onDown)
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerup", onUp)

  /* ---------- resize ---------- */
  function resize() {
    const w = canvas.clientWidth || canvas.parentElement.clientWidth
    const h = canvas.clientHeight || 420
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener("resize", resize)
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  /* ---------- view switching ---------- */
  let view = "csp"
  const btnCsp = document.getElementById("view-csp")
  const btnCvc = document.getElementById("view-cvc")
  const ctrlCsp = document.getElementById("controls-csp")
  const ctrlCvc = document.getElementById("controls-cvc")
  const subtitle = document.getElementById("sim-subtitle")
  const roL1Label = document.getElementById("ro-l1-label")
  const roL2Label = document.getElementById("ro-l2-label")
  const roL3Label = document.getElementById("ro-l3-label")

  function setView(next) {
    view = next
    const isCsp = next === "csp"
    csp.group.visible = isCsp
    cvc.group.visible = !isCsp
    btnCsp.classList.toggle("is-active", isCsp)
    btnCvc.classList.toggle("is-active", !isCsp)
    btnCsp.setAttribute("aria-selected", String(isCsp))
    btnCvc.setAttribute("aria-selected", String(!isCsp))
    ctrlCsp.hidden = !isCsp
    ctrlCvc.hidden = isCsp
    targetRotY = -0.4
    targetRotX = isCsp ? 0.05 : 0.02
    // Frame each scene nicely
    if (isCsp) {
      camera.position.set(0, 16, 38)
      camera.lookAt(0, 5, 0)
    } else {
      camera.position.set(0, 9, 30)
      camera.lookAt(0, 4, 0)
    }
    if (isCsp) {
      subtitle.textContent =
        "Centrale solaire à concentration : un champ d'héliostats suit le soleil et concentre le rayonnement sur le récepteur en haut de la tour."
      roL1Label.textContent = "Puissance thermique"
      roL2Label.textContent = "Température récepteur"
      roL3Label.textContent = "Rendement solaire"
    } else {
      subtitle.textContent =
        "Système CVC : une pompe à chaleur réversible et une CTA régulent la température des zones du bâtiment selon la consigne."
      roL1Label.textContent = "Température zones"
      roL2Label.textContent = "COP pompe à chaleur"
      roL3Label.textContent = "Puissance absorbée"
    }
  }
  btnCsp.addEventListener("click", () => setView("csp"))
  btnCvc.addEventListener("click", () => setView("cvc"))

  /* ---------- CSP controls ---------- */
  const cspSun = document.getElementById("csp-sun")
  const cspMirrors = document.getElementById("csp-mirrors")
  const cspFocus = document.getElementById("csp-focus")
  const cspTrack = document.getElementById("csp-track")
  const cspCycle = document.getElementById("csp-cycle")
  const valCspSun = document.getElementById("val-csp-sun")
  const valCspMirrors = document.getElementById("val-csp-mirrors")
  const valCspFocus = document.getElementById("val-csp-focus")

  let cspTracking = true
  let cspCycling = false

  cspSun.addEventListener("input", () => {
    cspCycling = false
    cspCycle.classList.remove("is-active")
    valCspSun.textContent = `${cspSun.value}°`
  })
  cspMirrors.addEventListener("input", () => {
    valCspMirrors.textContent = `${cspMirrors.value} miroirs`
  })
  cspFocus.addEventListener("input", () => {
    const f = parseFloat(cspFocus.value)
    valCspFocus.textContent = f > 0.85 ? "Optimale" : f > 0.5 ? "Moyenne" : "Faible"
  })
  cspTrack.addEventListener("click", () => {
    cspTracking = !cspTracking
    cspTrack.classList.toggle("is-off", !cspTracking)
    cspTrack.innerHTML = cspTracking
      ? '<i class="fas fa-crosshairs"></i> Suivi solaire'
      : '<i class="fas fa-ban"></i> Suivi coupé'
  })
  cspCycle.addEventListener("click", () => {
    cspCycling = !cspCycling
    cspCycle.classList.toggle("is-active", cspCycling)
  })

  /* ---------- CVC controls ---------- */
  const cvcSet = document.getElementById("cvc-set")
  const cvcOut = document.getElementById("cvc-out")
  const cvcFlow = document.getElementById("cvc-flow")
  const cvcMode = document.getElementById("cvc-mode")
  const cvcPower = document.getElementById("cvc-power")
  const valCvcSet = document.getElementById("val-cvc-set")
  const valCvcOut = document.getElementById("val-cvc-out")
  const valCvcFlow = document.getElementById("val-cvc-flow")

  let cvcHeating = true
  let cvcOn = true

  cvcSet.addEventListener("input", () => {
    valCvcSet.textContent = `${parseFloat(cvcSet.value).toFixed(1)} °C`
  })
  cvcOut.addEventListener("input", () => {
    valCvcOut.textContent = `${cvcOut.value} °C`
  })
  cvcFlow.addEventListener("input", () => {
    const f = parseFloat(cvcFlow.value)
    valCvcFlow.textContent = f > 0.75 ? "Élevé" : f > 0.4 ? "Nominal" : "Réduit"
  })
  cvcMode.addEventListener("click", () => {
    cvcHeating = !cvcHeating
    cvcMode.innerHTML = cvcHeating
      ? '<i class="fas fa-fire"></i> Mode chauffage'
      : '<i class="fas fa-snowflake"></i> Mode rafraîchissement'
    cvcMode.classList.toggle("is-cool", !cvcHeating)
  })
  cvcPower.addEventListener("click", () => {
    cvcOn = !cvcOn
    cvcPower.classList.toggle("is-off", !cvcOn)
    cvcPower.innerHTML = cvcOn
      ? '<i class="fas fa-power-off"></i> Marche / Arrêt'
      : '<i class="fas fa-power-off"></i> Système à l\'arrêt'
  })

  /* ---------- readouts ---------- */
  const roL1 = document.getElementById("ro-l1")
  const roL2 = document.getElementById("ro-l2")
  const roL3 = document.getElementById("ro-l3")

  /* ---------- animation loop ---------- */
  const clock = new THREE.Clock()
  let roAccum = 0

  function animate() {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    // idle auto-spin
    if (!dragging && idleSpin) targetRotY += dt * 0.12
    curRotY += (targetRotY - curRotY) * 0.08
    curRotX += (targetRotX - curRotX) * 0.08
    world.rotation.y = curRotY
    world.rotation.x = curRotX

    if (view === "csp") {
      // day cycle
      if (cspCycling) {
        const e = 47.5 + 42.5 * Math.sin(t * 0.15)
        cspSun.value = e.toFixed(0)
        valCspSun.textContent = `${e.toFixed(0)}°`
      }
      const sunEl = (parseFloat(cspSun.value) * Math.PI) / 180
      const mirrors = parseInt(cspMirrors.value, 10)
      const focus = parseFloat(cspFocus.value)
      const metrics = csp.update(dt, t, { sunEl, mirrors, focus, tracking: cspTracking })
      roAccum += dt
      if (roAccum > 0.15) {
        roAccum = 0
        roL1.textContent = `${metrics.power.toFixed(0)} MW`
        roL2.textContent = `${metrics.temp.toFixed(0)} °C`
        roL3.textContent = `${metrics.eff.toFixed(1)} %`
      }
    } else {
      const metrics = cvc.update(dt, t, {
        setpoint: parseFloat(cvcSet.value),
        outdoor: parseFloat(cvcOut.value),
        flow: parseFloat(cvcFlow.value),
        heating: cvcHeating,
        on: cvcOn,
      })
      roAccum += dt
      if (roAccum > 0.15) {
        roAccum = 0
        roL1.textContent = `${metrics.zoneTemp.toFixed(1)} °C`
        roL2.textContent = cvcOn ? metrics.cop.toFixed(2) : "—"
        roL3.textContent = cvcOn ? `${metrics.power.toFixed(1)} kW` : "0 kW"
      }
    }

    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }

  setView("csp")
  animate()
}

/* ============================================================
   CSP — Concentrated Solar Power tower
   ============================================================ */
function buildCSP() {
  const group = new THREE.Group()

  // Desert ground
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 1, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.01
  group.add(ground)

  // subtle ground ring grid
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(21.5, 22, 80),
    new THREE.MeshBasicMaterial({ color: C_TEAL, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  group.add(ring)

  // Tower
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.95, 12, 20),
    new THREE.MeshStandardMaterial({ color: 0x9fb0c8, roughness: 0.6, metalness: 0.3 }),
  )
  tower.position.y = 6
  group.add(tower)

  // Receiver (glowing) at top
  const receiverPos = new THREE.Vector3(0, 12.4, 0)
  const receiverMat = new THREE.MeshStandardMaterial({
    color: C_AMBER,
    emissive: C_AMBER,
    emissiveIntensity: 1.5,
  })
  const receiver = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 16), receiverMat)
  receiver.position.copy(receiverPos)
  group.add(receiver)

  const glow = new THREE.PointLight(C_AMBER, 2, 40)
  glow.position.copy(receiverPos)
  group.add(glow)

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1.9, 16, 16),
    new THREE.MeshBasicMaterial({ color: C_AMBER, transparent: true, opacity: 0.18 }),
  )
  halo.position.copy(receiverPos)
  group.add(halo)

  // Sun
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c2 }),
  )
  group.add(sun)
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2.6, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.25 }),
  )
  group.add(sunGlow)
  const sunLight = new THREE.DirectionalLight(0xfff0c0, 1.0)
  group.add(sunLight)

  // Heliostat field (phyllotaxis layout)
  const MAX = 200
  const helios = []
  const mirrorGeo = new THREE.PlaneGeometry(1.15, 1.15)
  const beamGeo = () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3))
    return g
  }
  for (let i = 0; i < MAX; i++) {
    const r = 3.4 + 17 * Math.sqrt(i / MAX)
    const theta = i * 2.399963
    const x = Math.cos(theta) * r
    const z = Math.sin(theta) * r

    const hgroup = new THREE.Group()
    hgroup.position.set(x, 0, z)

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x64748b }),
    )
    post.position.y = 0.6
    hgroup.add(post)

    const mirror = new THREE.Mesh(
      mirrorGeo,
      new THREE.MeshStandardMaterial({
        color: 0xbcd4f5,
        emissive: 0x21406b,
        emissiveIntensity: 0.35,
        metalness: 0.9,
        roughness: 0.15,
        side: THREE.DoubleSide,
      }),
    )
    mirror.position.y = 1.3
    hgroup.add(mirror)

    const beam = new THREE.Line(
      beamGeo(),
      new THREE.LineBasicMaterial({ color: C_AMBER, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending }),
    )
    group.add(beam)

    group.add(hgroup)
    helios.push({ hgroup, mirror, beam, pos: new THREE.Vector3(x, 1.3, z) })
  }

  const sunDir = new THREE.Vector3()
  const nrm = new THREE.Vector3()
  const toSun = new THREE.Vector3()
  const toRec = new THREE.Vector3()
  const up = new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion()

  function update(dt, t, opts) {
    const { sunEl, mirrors, focus, tracking } = opts
    // Sun position
    const az = -0.7
    const R = 34
    const sx = R * Math.cos(sunEl) * Math.cos(az)
    const sy = R * Math.sin(sunEl)
    const sz = R * Math.cos(sunEl) * Math.sin(az)
    sun.position.set(sx, sy + 2, sz)
    sunGlow.position.copy(sun.position)
    sunLight.position.copy(sun.position)
    sunDir.copy(sun.position).normalize()

    const daylight = Math.max(Math.sin(sunEl), 0)

    for (let i = 0; i < helios.length; i++) {
      const h = helios[i]
      const active = i < mirrors && daylight > 0.02
      h.hgroup.visible = i < mirrors
      if (!active) {
        h.beam.material.opacity = 0
        continue
      }
      // heliostat normal = bisector of sun & receiver directions
      toSun.copy(sun.position).sub(h.pos).normalize()
      toRec.copy(receiverPos).sub(h.pos).normalize()
      nrm.copy(toSun).add(toRec).normalize()
      // blend toward flat (up) when focus is poor
      if (focus < 1) {
        nrm.lerp(new THREE.Vector3(0, 1, 0), (1 - focus) * 0.6).normalize()
      }
      if (!tracking) {
        nrm.set(0, 1, 0)
      }
      q.setFromUnitVectors(up, nrm)
      h.mirror.quaternion.slerp(q, 0.2)

      // beam
      const beamOn = tracking && focus > 0.05
      const targetOp = beamOn ? 0.05 + focus * 0.28 * daylight : 0
      h.beam.material.opacity += (targetOp - h.beam.material.opacity) * 0.2
      const posAttr = h.beam.geometry.attributes.position
      posAttr.setXYZ(0, h.pos.x, h.pos.y, h.pos.z)
      posAttr.setXYZ(1, receiverPos.x, receiverPos.y, receiverPos.z)
      posAttr.needsUpdate = true
    }

    // receiver glow reacts to concentrated power
    const conc = (mirrors / MAX) * focus * daylight * (tracking ? 1 : 0)
    receiverMat.emissiveIntensity = 0.6 + conc * 2.6
    glow.intensity = 0.5 + conc * 3.5
    halo.scale.setScalar(0.7 + conc * 0.9)
    halo.material.opacity = 0.1 + conc * 0.25

    // ambient day tint
    const power = mirrors * focus * daylight * (tracking ? 1 : 0) * (150 / MAX)
    const temp = 290 + conc * 305
    const eff = 8 + conc * 32
    return { power, temp, eff }
  }

  return { group, update }
}

/* ============================================================
   CVC — Building HVAC loop (reversible heat pump + AHU + ducts)
   ============================================================ */
function buildCVC() {
  const group = new THREE.Group()
  group.position.y = -1.5
  group.scale.setScalar(1.15)

  // Ground slab
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(28, 0.4, 20),
    new THREE.MeshStandardMaterial({ color: 0x18202f, roughness: 1 }),
  )
  slab.position.y = -0.7
  group.add(slab)

  // Building shell (cutaway: front face open) — 2 columns x 2 rows of zones
  const bW = 12
  const bH = 9
  const bD = 7
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a3550,
    roughness: 0.8,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  })
  const building = new THREE.Group()
  building.position.set(-1, bH / 2, 0)
  group.add(building)

  // back wall
  const back = new THREE.Mesh(new THREE.PlaneGeometry(bW, bH), wallMat)
  back.position.set(0, 0, -bD / 2)
  building.add(back)
  // side walls
  const left = new THREE.Mesh(new THREE.PlaneGeometry(bD, bH), wallMat)
  left.rotation.y = Math.PI / 2
  left.position.set(-bW / 2, 0, 0)
  building.add(left)
  const right = new THREE.Mesh(new THREE.PlaneGeometry(bD, bH), wallMat)
  right.rotation.y = Math.PI / 2
  right.position.set(bW / 2, 0, 0)
  building.add(right)
  // roof + floor + mid slab
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x35425f, roughness: 0.9, side: THREE.DoubleSide })
  for (const yy of [-bH / 2, 0, bH / 2]) {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(bW, bD), slabMat)
    fl.rotation.x = -Math.PI / 2
    fl.position.set(0, yy, 0)
    building.add(fl)
  }
  const midCol = new THREE.Mesh(new THREE.PlaneGeometry(bD, bH), slabMat)
  midCol.rotation.y = Math.PI / 2
  midCol.position.set(0, 0, 0)
  building.add(midCol)

  // Zone temperature planes (colored glass showing zone temp)
  const zones = []
  const zoneOffsets = [
    [-bW / 4, bH / 4],
    [bW / 4, bH / 4],
    [-bW / 4, -bH / 4],
    [bW / 4, -bH / 4],
  ]
  for (const [zx, zy] of zoneOffsets) {
    const zoneMat = new THREE.MeshBasicMaterial({
      color: C_COLD,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    })
    const box = new THREE.Mesh(new THREE.BoxGeometry(bW / 2 - 0.4, bH / 2 - 0.4, bD - 0.6), zoneMat)
    box.position.set(zx, zy, 0)
    building.add(box)
    zones.push({ mesh: box, mat: zoneMat, temp: 15, pos: new THREE.Vector3(zx - 1, zy + bH / 2, 0) })
  }

  // Outdoor heat pump unit (left)
  const hp = new THREE.Group()
  hp.position.set(-9.5, 1.1, 3)
  group.add(hp)
  const hpBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 2.2, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x8794ad, roughness: 0.6, metalness: 0.3 }),
  )
  hp.add(hpBody)
  // fan
  const fan = new THREE.Group()
  fan.position.set(0, 0, 0.95)
  hp.add(fan)
  const fanRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.75, 0.08, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x334155 }),
  )
  fan.add(fanRing)
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.14, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8 }),
    )
    blade.rotation.z = (i / 4) * Math.PI * 2
    blade.position.set(Math.cos(blade.rotation.z) * 0.35, Math.sin(blade.rotation.z) * 0.35, 0)
    fan.add(blade)
  }

  // Refrigerant pipe from heat pump to building (AHU)
  const ahuPos = new THREE.Vector3(-7.2, 1.2, 3)
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.4 })
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.3, 10), pipeMat)
  pipe.rotation.z = Math.PI / 2
  pipe.position.set(-8.35, 1.2, 3)
  group.add(pipe)

  // Air Handling Unit (CTA)
  const ahu = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xaeb9cf, roughness: 0.5, metalness: 0.3 }),
  )
  ahu.position.copy(ahuPos)
  group.add(ahu)

  // Supply duct: AHU -> up the left side -> branches into zones
  const ductMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.4, metalness: 0.5 })
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 9, 12), ductMat)
  riser.position.set(-7.2, 4.5, -1.5)
  group.add(riser)
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3.6, 12), ductMat)
  feed.rotation.z = Math.PI / 2
  feed.position.set(-8.9, 1.2, 1)
  group.add(feed)

  // Airflow particles travelling from AHU into each zone
  const flows = []
  const ductStart = new THREE.Vector3(-7.2, 8.5, -1.5)
  const particleGeo = new THREE.SphereGeometry(0.14, 8, 8)
  for (let z = 0; z < zones.length; z++) {
    const target = zones[z].pos.clone().add(new THREE.Vector3(0, -0.5, 0))
    for (let k = 0; k < 5; k++) {
      const pmat = new THREE.MeshBasicMaterial({ color: C_HOT, transparent: true, opacity: 0.9 })
      const p = new THREE.Mesh(particleGeo, pmat)
      group.add(p)
      flows.push({ mesh: p, mat: pmat, start: ductStart, end: target, t: (k / 5) + z * 0.03 })
    }
  }

  const tmpColor = new THREE.Color()
  const cold = new THREE.Color(C_COLD)
  const warm = new THREE.Color(C_HOT)
  let fanSpeed = 0

  function update(dt, t, opts) {
    const { setpoint, outdoor, flow, heating, on } = opts

    // Fan / airflow speed
    const targetFan = on ? 2 + flow * 8 : 0
    fanSpeed += (targetFan - fanSpeed) * 0.05
    fan.rotation.z += fanSpeed * dt

    // Zone thermal dynamics: move toward setpoint (when on) vs leak to outdoor
    let avg = 0
    for (const zone of zones) {
      const leak = (outdoor - zone.temp) * 0.04 * dt
      let cond = 0
      if (on) {
        cond = (setpoint - zone.temp) * (0.15 + flow * 0.5) * dt
      }
      zone.temp += leak + cond
      avg += zone.temp
      // color by temperature 15..28
      const f = Math.max(0, Math.min(1, (zone.temp - 15) / 13))
      tmpColor.copy(cold).lerp(warm, f)
      zone.mat.color.copy(tmpColor)
      zone.mat.opacity = 0.22 + f * 0.18
    }
    avg /= zones.length

    // airflow particles
    const flowColor = heating ? warm : cold
    for (const fl of flows) {
      fl.t += dt * (on ? 0.15 + flow * 0.5 : 0)
      if (fl.t > 1) fl.t -= 1
      const e = fl.t
      // simple two-segment path: down the riser then to zone
      fl.mesh.position.lerpVectors(fl.start, fl.end, e)
      fl.mesh.position.x += Math.sin(e * Math.PI) * 0.3
      fl.mat.color.copy(flowColor)
      fl.mat.opacity = on ? 0.35 + Math.sin(e * Math.PI) * 0.55 : 0
    }

    // metrics
    const deltaT = Math.abs(setpoint - outdoor)
    // COP degrades with temperature lift
    const cop = Math.max(1.6, (heating ? 5.4 : 4.6) - deltaT * 0.09)
    const load = (0.4 + flow) * (0.6 + deltaT * 0.05) * 4 // kW thermal-ish
    const power = on ? load / cop : 0

    return { zoneTemp: avg, cop, power }
  }

  return { group, update }
}
