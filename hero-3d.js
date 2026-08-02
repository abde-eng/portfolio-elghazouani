/* ============================================================
   Interactive 3D Hero Scene — Abdelilah El Ghazouani
   Energy-themed: a glowing core with orbiting solar panels,
   an energy grid and a floating particle field.
   Built with Three.js (ES modules via CDN).
   ============================================================ */

import * as THREE from "three"

const canvas = document.getElementById("hero-canvas")

// Respect users who prefer reduced motion.
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches

if (canvas && window.WebGLRenderingContext) {
  initHeroScene(canvas)
}

function initHeroScene(canvas) {
  const scene = new THREE.Scene()

  // Theme colors (match the site's blue / teal / amber palette)
  const COLOR_PRIMARY = 0x3b82f6
  const COLOR_SECONDARY = 0x14b8a6
  const COLOR_ACCENT = 0xf59e0b

  // ---------- Camera ----------
  const camera = new THREE.PerspectiveCamera(
    45,
    canvas.clientWidth / canvas.clientHeight,
    0.1,
    100,
  )
  camera.position.set(0, 0, 9)

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // ---------- Lights ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.4))

  const keyLight = new THREE.PointLight(COLOR_PRIMARY, 60, 100)
  keyLight.position.set(6, 6, 8)
  scene.add(keyLight)

  const fillLight = new THREE.PointLight(COLOR_SECONDARY, 40, 100)
  fillLight.position.set(-6, -4, 6)
  scene.add(fillLight)

  // ---------- Group that holds everything (for global rotation) ----------
  const world = new THREE.Group()
  scene.add(world)

  // ---------- Central energy core ----------
  const coreGeometry = new THREE.IcosahedronGeometry(1.35, 1)
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: COLOR_PRIMARY,
    emissive: COLOR_PRIMARY,
    emissiveIntensity: 0.55,
    metalness: 0.6,
    roughness: 0.25,
    flatShading: true,
  })
  const core = new THREE.Mesh(coreGeometry, coreMaterial)
  world.add(core)

  // Wireframe shell around the core
  const shellGeometry = new THREE.IcosahedronGeometry(1.7, 1)
  const shellMaterial = new THREE.MeshBasicMaterial({
    color: COLOR_SECONDARY,
    wireframe: true,
    transparent: true,
    opacity: 0.35,
  })
  const shell = new THREE.Mesh(shellGeometry, shellMaterial)
  world.add(shell)

  // ---------- Orbiting solar panels ----------
  const panels = []
  const panelCount = 3
  const panelGeometry = new THREE.BoxGeometry(1.5, 1, 0.06)
  const cellTexture = createSolarPanelTexture()

  for (let i = 0; i < panelCount; i++) {
    const panelMaterial = new THREE.MeshStandardMaterial({
      map: cellTexture,
      color: 0x1e3a8a,
      emissive: COLOR_PRIMARY,
      emissiveIntensity: 0.12,
      metalness: 0.7,
      roughness: 0.3,
    })
    const panel = new THREE.Mesh(panelGeometry, panelMaterial)

    const orbit = new THREE.Group()
    const angle = (i / panelCount) * Math.PI * 2
    const radius = 3.6
    panel.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)
    panel.lookAt(0, 0, 0)

    orbit.add(panel)
    orbit.rotation.x = (i - 1) * 0.5
    orbit.userData.speed = 0.12 + i * 0.04
    orbit.userData.tilt = (i - 1) * 0.5

    world.add(orbit)
    panels.push(orbit)
  }

  // ---------- Orbit rings (energy grid) ----------
  const ringGroup = new THREE.Group()
  for (let i = 0; i < 2; i++) {
    const ringGeometry = new THREE.TorusGeometry(3.6, 0.015, 12, 120)
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: i === 0 ? COLOR_SECONDARY : COLOR_ACCENT,
      transparent: true,
      opacity: 0.4,
    })
    const ring = new THREE.Mesh(ringGeometry, ringMaterial)
    ring.rotation.x = Math.PI / 2 + (i - 0.5) * 0.6
    ring.rotation.y = i * 0.4
    ringGroup.add(ring)
  }
  world.add(ringGroup)

  // ---------- Energy pulses travelling along the grid rings ----------
  const pulses = []
  const pulseGeometry = new THREE.SphereGeometry(0.07, 12, 12)
  for (let i = 0; i < 6; i++) {
    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: i % 2 === 0 ? COLOR_ACCENT : COLOR_SECONDARY,
      transparent: true,
      opacity: 0.9,
    })
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial)
    pulse.userData.radius = 3.6
    pulse.userData.speed = 0.5 + Math.random() * 0.5
    pulse.userData.offset = (i / 6) * Math.PI * 2
    pulse.userData.ringTilt = i < 3 ? 0.3 : -0.3
    world.add(pulse)
    pulses.push(pulse)
  }

  // ---------- Floating particle field ----------
  const particleCount = 700
  const positions = new Float32Array(particleCount * 3)
  for (let i = 0; i < particleCount; i++) {
    const r = 6 + Math.random() * 8
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
  }
  const particleGeometry = new THREE.BufferGeometry()
  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  )
  const particleMaterial = new THREE.PointsMaterial({
    color: 0x93c5fd,
    size: 0.05,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })
  const particles = new THREE.Points(particleGeometry, particleMaterial)
  scene.add(particles)

  // ---------- Interactivity (parallax toward pointer) ----------
  const pointer = { x: 0, y: 0 }
  const target = { x: 0, y: 0 }

  window.addEventListener("pointermove", (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1
  })

  // ---------- Resize handling ----------
  function resize() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
  }
  window.addEventListener("resize", resize)
  resize()

  // ---------- Animation loop ----------
  const clock = new THREE.Clock()

  function animate() {
    requestAnimationFrame(animate)
    const elapsed = clock.getElapsedTime()
    const speedFactor = prefersReducedMotion ? 0.15 : 1

    // Smooth parallax toward pointer
    target.x += (pointer.x * 0.4 - target.x) * 0.05
    target.y += (pointer.y * 0.3 - target.y) * 0.05
    world.rotation.y = elapsed * 0.15 * speedFactor + target.x
    world.rotation.x = target.y

    // Core pulse
    core.rotation.y = elapsed * 0.4 * speedFactor
    core.rotation.x = elapsed * 0.2 * speedFactor
    const pulse = 1 + Math.sin(elapsed * 1.6) * 0.04
    core.scale.setScalar(pulse)
    coreMaterial.emissiveIntensity = 0.45 + Math.sin(elapsed * 1.6) * 0.12

    // Counter-rotating shell
    shell.rotation.y = -elapsed * 0.25 * speedFactor
    shell.rotation.z = elapsed * 0.12 * speedFactor

    // Orbiting panels
    panels.forEach((orbit) => {
      orbit.rotation.y = elapsed * orbit.userData.speed * speedFactor
    })

    // Slow ring drift
    ringGroup.rotation.z = elapsed * 0.05 * speedFactor

    // Energy pulses circulating along the grid rings
    pulses.forEach((pulse) => {
      const a = elapsed * pulse.userData.speed * speedFactor + pulse.userData.offset
      const r = pulse.userData.radius
      pulse.position.set(
        Math.cos(a) * r,
        Math.sin(a) * r * pulse.userData.ringTilt,
        Math.sin(a) * r,
      )
      const twinkle = 0.6 + Math.abs(Math.sin(a * 2)) * 0.4
      pulse.material.opacity = twinkle
      pulse.scale.setScalar(0.8 + twinkle * 0.5)
    })

    // Particle drift
    particles.rotation.y = elapsed * 0.02 * speedFactor
    particles.rotation.x = elapsed * 0.01 * speedFactor

    resize()
    renderer.render(scene, camera)
  }
  animate()
}

/* Build a simple solar-panel cell texture on a canvas */
function createSolarPanelTexture() {
  const size = 256
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d")

  ctx.fillStyle = "#0f2557"
  ctx.fillRect(0, 0, size, size)

  const cols = 4
  const rows = 3
  const gap = 6
  const cellW = (size - gap * (cols + 1)) / cols
  const cellH = (size - gap * (rows + 1)) / rows

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = gap + col * (cellW + gap)
      const y = gap + r * (cellH + gap)
      const grad = ctx.createLinearGradient(x, y, x + cellW, y + cellH)
      grad.addColorStop(0, "#1e40af")
      grad.addColorStop(1, "#0b1c44")
      ctx.fillStyle = grad
      ctx.fillRect(x, y, cellW, cellH)
      ctx.strokeStyle = "rgba(147,197,253,0.35)"
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, cellW, cellH)
    }
  }

  const texture = new THREE.CanvasTexture(c)
  texture.anisotropy = 4
  return texture
}
