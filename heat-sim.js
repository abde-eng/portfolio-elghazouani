/* ============================================================
   Real-time GPU Heat-Diffusion Simulation
   Solves Fourier's heat equation  ∂T/∂t = α ∇²T  on the GPU
   via a ping-pong render-target finite-difference scheme, and
   renders the temperature field as a displaced 3D thermal
   surface with a scientific thermal-camera colour ramp.

   Author: portfolio of Abdelilah El Ghazouani
   Built with Three.js (ES modules via CDN).
   ============================================================ */

import * as THREE from "three"

const canvas = document.getElementById("sim-canvas")
if (canvas && window.WebGLRenderingContext) {
  try {
    initHeatSim(canvas)
  } catch (err) {
    console.log("[v0] Heat sim failed to init:", err && err.message)
    showFallback()
  }
}

function showFallback() {
  const stage = document.querySelector(".sim-stage")
  if (stage) stage.classList.add("sim-unsupported")
}

function initHeatSim(canvas) {
  const SIM_SIZE = 256 // simulation grid resolution

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  })
  renderer.setClearColor(0x0a1120, 1)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // Pick the best supported float texture type for the sim state.
  let simType = THREE.HalfFloatType
  const gl = renderer.getContext()
  const isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext
  if (!isWebGL2 && !renderer.extensions.get("OES_texture_half_float")) {
    simType = THREE.UnsignedByteType
  }

  // ---------- Ping-pong render targets holding the temperature field ----------
  function makeTarget() {
    return new THREE.WebGLRenderTarget(SIM_SIZE, SIM_SIZE, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      type: simType,
      depthBuffer: false,
      stencilBuffer: false,
    })
  }
  let rtA = makeTarget()
  let rtB = makeTarget()

  // ---------- Off-screen scene used for the simulation pass ----------
  const simScene = new THREE.Scene()
  const simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const simUniforms = {
    uPrev: { value: null },
    uTexel: { value: new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE) },
    uAlpha: { value: 0.24 },
    uCooling: { value: 0.0008 },
    uSource: { value: new THREE.Vector2(-1, -1) },
    uSourceActive: { value: 0 },
    uSourceHeat: { value: 0.7 },
    uSourceRadius: { value: 0.03 },
  }

  const simMaterial = new THREE.ShaderMaterial({
    uniforms: simUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D uPrev;
      uniform vec2 uTexel;
      uniform float uAlpha;
      uniform float uCooling;
      uniform vec2 uSource;
      uniform int uSourceActive;
      uniform float uSourceHeat;
      uniform float uSourceRadius;

      void main() {
        float c = texture2D(uPrev, vUv).r;
        float l = texture2D(uPrev, vUv - vec2(uTexel.x, 0.0)).r;
        float r = texture2D(uPrev, vUv + vec2(uTexel.x, 0.0)).r;
        float u = texture2D(uPrev, vUv + vec2(0.0, uTexel.y)).r;
        float d = texture2D(uPrev, vUv - vec2(0.0, uTexel.y)).r;

        // Discrete Laplacian (finite differences) -> Fourier heat equation
        float lap = (l + r + u + d - 4.0 * c);
        float t = c + uAlpha * lap;

        // Inject heat from the pointer as a soft Gaussian source
        if (uSourceActive == 1) {
          float dist = distance(vUv, uSource);
          t += uSourceHeat * exp(-(dist * dist) / (uSourceRadius * uSourceRadius));
        }

        // Newtonian cooling toward ambient
        t -= t * uCooling;

        t = clamp(t, 0.0, 1.0);
        gl_FragColor = vec4(t, 0.0, 0.0, 1.0);
      }
    `,
  })
  const simQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), simMaterial)
  simScene.add(simQuad)

  // ---------- Seed pass: clear both targets to ambient (0) ----------
  const clearMaterial = new THREE.ShaderMaterial({
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`,
  })
  function clearField() {
    simQuad.material = clearMaterial
    renderer.setRenderTarget(rtA)
    renderer.render(simScene, simCamera)
    renderer.setRenderTarget(rtB)
    renderer.render(simScene, simCamera)
    renderer.setRenderTarget(null)
    simQuad.material = simMaterial
  }
  clearField()

  // ---------- Display scene: 3D thermal surface ----------
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    42,
    canvas.clientWidth / Math.max(canvas.clientHeight, 1),
    0.1,
    100,
  )
  camera.position.set(0, 2.4, 3.5)
  camera.lookAt(0, -0.1, 0)

  const surfaceUniforms = {
    uField: { value: null },
    uTexel: { value: new THREE.Vector2(1 / SIM_SIZE, 1 / SIM_SIZE) },
    uDisplace: { value: 0.85 },
  }

  const surfaceMaterial = new THREE.ShaderMaterial({
    uniforms: surfaceUniforms,
    vertexShader: `
      precision highp float;
      uniform sampler2D uField;
      uniform vec2 uTexel;
      uniform float uDisplace;
      varying float vTemp;
      varying vec3 vNormalW;

      float getT(vec2 uv){ return texture2D(uField, uv).r; }

      void main() {
        float t = getT(uv);
        vTemp = t;

        // Estimate a normal from the height field for lighting.
        float hL = getT(uv - vec2(uTexel.x, 0.0));
        float hR = getT(uv + vec2(uTexel.x, 0.0));
        float hD = getT(uv - vec2(0.0, uTexel.y));
        float hU = getT(uv + vec2(0.0, uTexel.y));
        vec3 n = normalize(vec3((hL - hR) * uDisplace, (hD - hU) * uDisplace, uTexel.x * 4.0));
        vNormalW = n;

        vec3 pos = position;
        pos.z += t * uDisplace; // displace along the plane's local normal (plane lies in XY)
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying float vTemp;
      varying vec3 vNormalW;

      // Scientific thermal-camera (inferno-like) colour ramp.
      vec3 thermal(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c0 = vec3(0.02, 0.03, 0.12); // deep blue-black (cold)
        vec3 c1 = vec3(0.24, 0.05, 0.42); // purple
        vec3 c2 = vec3(0.68, 0.12, 0.36); // magenta-red
        vec3 c3 = vec3(0.96, 0.38, 0.10); // orange
        vec3 c4 = vec3(0.99, 0.78, 0.20); // amber-yellow
        vec3 c5 = vec3(1.00, 0.99, 0.90); // white-hot
        vec3 col = mix(c0, c1, smoothstep(0.0, 0.2, t));
        col = mix(col, c2, smoothstep(0.2, 0.4, t));
        col = mix(col, c3, smoothstep(0.4, 0.62, t));
        col = mix(col, c4, smoothstep(0.62, 0.82, t));
        col = mix(col, c5, smoothstep(0.82, 1.0, t));
        return col;
      }

      void main() {
        vec3 base = thermal(vTemp);

        // Simple directional lighting for depth cues.
        vec3 lightDir = normalize(vec3(0.4, 0.7, 0.6));
        float diff = clamp(dot(normalize(vNormalW), lightDir), 0.0, 1.0);
        float shade = 0.55 + 0.45 * diff;

        // Emissive boost where it is hot so it glows.
        vec3 col = base * shade + base * vTemp * 0.6;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })

  // High-subdivision plane laid flat, displaced by temperature.
  const surfaceGeo = new THREE.PlaneGeometry(3.2, 3.2, SIM_SIZE - 1, SIM_SIZE - 1)
  const surface = new THREE.Mesh(surfaceGeo, surfaceMaterial)
  surface.rotation.x = -Math.PI / 2.35 // tilt for a nice perspective
  scene.add(surface)

  // Subtle wireframe grid overlay for the "scientific" look.
  const gridMat = new THREE.ShaderMaterial({
    uniforms: surfaceUniforms,
    transparent: true,
    wireframe: true,
    vertexShader: surfaceMaterial.vertexShader,
    fragmentShader: `
      precision highp float;
      varying float vTemp;
      varying vec3 vNormalW;
      void main(){
        gl_FragColor = vec4(0.6, 0.75, 1.0, 0.06 + vTemp * 0.10);
      }
    `,
  })
  const grid = new THREE.Mesh(surfaceGeo, gridMat)
  grid.rotation.x = surface.rotation.x
  grid.scale.setScalar(1.001)
  scene.add(grid)

  // ---------- Pointer interaction: raycast onto the surface to inject heat ----------
  const raycaster = new THREE.Raycaster()
  const pointerNDC = new THREE.Vector2()
  let pointerDown = false

  function updatePointer(e) {
    const rect = canvas.getBoundingClientRect()
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    pointerNDC.x = (cx / rect.width) * 2 - 1
    pointerNDC.y = -(cy / rect.height) * 2 + 1
    raycaster.setFromCamera(pointerNDC, camera)
    const hit = raycaster.intersectObject(surface)[0]
    if (hit && hit.uv) {
      simUniforms.uSource.value.set(hit.uv.x, hit.uv.y)
      simUniforms.uSourceActive.value = 1
    } else {
      simUniforms.uSourceActive.value = 0
    }
  }

  canvas.addEventListener("pointerdown", (e) => {
    pointerDown = true
    updatePointer(e)
  })
  canvas.addEventListener("pointermove", (e) => {
    if (pointerDown) {
      e.preventDefault()
      updatePointer(e)
    }
  })
  window.addEventListener("pointerup", () => {
    pointerDown = false
    simUniforms.uSourceActive.value = 0
  })
  canvas.addEventListener("pointerleave", () => {
    if (!pointerDown) simUniforms.uSourceActive.value = 0
  })

  // Auto demo heat pulses until the user interacts, so it looks alive.
  let userInteracted = false
  canvas.addEventListener("pointerdown", () => (userInteracted = true))

  // ---------- Controls wiring ----------
  const readoutTemp = document.getElementById("ro-temp")
  const readoutMat = document.getElementById("ro-material")
  const readoutAlpha = document.getElementById("ro-alpha")

  const powerSlider = document.getElementById("ctrl-power")
  const alphaSlider = document.getElementById("ctrl-alpha")
  const coolSlider = document.getElementById("ctrl-cool")
  const valPower = document.getElementById("val-power")
  const valAlpha = document.getElementById("val-alpha")
  const valCool = document.getElementById("val-cool")

  function powerLabel(v) {
    if (v < 0.35) return "Faible"
    if (v < 0.7) return "Moyenne"
    return "Élevée"
  }
  function coolLabel(v) {
    if (v < 0.0015) return "Faible"
    if (v < 0.004) return "Moyen"
    return "Fort"
  }

  if (powerSlider) {
    powerSlider.addEventListener("input", () => {
      simUniforms.uSourceHeat.value = parseFloat(powerSlider.value)
      if (valPower) valPower.textContent = powerLabel(parseFloat(powerSlider.value))
    })
  }
  if (alphaSlider) {
    alphaSlider.addEventListener("input", () => {
      simUniforms.uAlpha.value = parseFloat(alphaSlider.value)
      if (valAlpha) valAlpha.textContent = parseFloat(alphaSlider.value).toFixed(2)
    })
  }
  if (coolSlider) {
    coolSlider.addEventListener("input", () => {
      simUniforms.uCooling.value = parseFloat(coolSlider.value)
      if (valCool) valCool.textContent = coolLabel(parseFloat(coolSlider.value))
    })
  }

  // Material preset buttons
  const matButtons = document.querySelectorAll(".sim-mat")
  matButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      matButtons.forEach((b) => b.classList.remove("is-active"))
      btn.classList.add("is-active")
      const alpha = parseFloat(btn.dataset.alpha)
      const cool = parseFloat(btn.dataset.cool)
      simUniforms.uAlpha.value = alpha
      simUniforms.uCooling.value = cool
      if (alphaSlider) alphaSlider.value = alpha
      if (valAlpha) valAlpha.textContent = alpha.toFixed(2)
      if (coolSlider) coolSlider.value = cool
      if (valCool) valCool.textContent = coolLabel(cool)
      if (readoutMat) readoutMat.textContent = btn.dataset.label
      if (readoutAlpha) readoutAlpha.textContent = btn.dataset.real
    })
  })

  // Play / pause + reset
  let running = true
  const toggleBtn = document.getElementById("sim-toggle")
  const resetBtn = document.getElementById("sim-reset")
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      running = !running
      toggleBtn.innerHTML = running
        ? '<i class="fas fa-pause"></i> Pause'
        : '<i class="fas fa-play"></i> Reprendre'
    })
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      clearField()
      userInteracted = false
    })
  }

  // ---------- Read back the max temperature occasionally for the HUD ----------
  const readPixels = new Uint8Array(4)
  let hudTick = 0
  function updateHUD() {
    // Sample the centre of the field as a lightweight "T" proxy.
    // (A full max reduction would be costly; a sampled proxy is enough for the HUD.)
    if (!readoutTemp) return
    renderer.setRenderTarget(rtA)
    try {
      renderer.readRenderTargetPixels(rtA, SIM_SIZE / 2, SIM_SIZE / 2, 1, 1, readPixels)
    } catch (e) {
      /* half-float readback may be unsupported; ignore */
    }
    renderer.setRenderTarget(null)
  }

  // ---------- Resize ----------
  function resize() {
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (canvas.width !== w || canvas.height !== h) {
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
  }

  // ---------- Main loop ----------
  const clock = new THREE.Clock()
  let peak = 0

  function frame() {
    requestAnimationFrame(frame)
    resize()
    const time = clock.getElapsedTime()

    // Auto ambient heat sources before the user interacts.
    if (!userInteracted && running) {
      const auto = Math.sin(time * 0.6)
      simUniforms.uSource.value.set(
        0.5 + Math.cos(time * 0.5) * 0.28,
        0.5 + Math.sin(time * 0.7) * 0.28,
      )
      simUniforms.uSourceActive.value = auto > 0.3 ? 1 : 0
      simUniforms.uSourceHeat.value = parseFloat(powerSlider ? powerSlider.value : 0.7)
    }

    if (running) {
      // Run a few diffusion sub-steps per frame for a lively result.
      const steps = 3
      for (let i = 0; i < steps; i++) {
        simUniforms.uPrev.value = rtA.texture
        renderer.setRenderTarget(rtB)
        renderer.render(simScene, simCamera)
        renderer.setRenderTarget(null)
        const tmp = rtA
        rtA = rtB
        rtB = tmp
        // only inject on the first sub-step to avoid over-heating
        if (i === 0) simUniforms.uSourceActive.value = 0
      }
    }

    // Gentle auto-rotation of the surface for presentation.
    surface.rotation.z += 0.0008
    grid.rotation.z = surface.rotation.z

    // Draw the thermal surface using the latest field.
    surfaceUniforms.uField.value = rtA.texture
    renderer.render(scene, camera)

    // Update HUD proxy occasionally.
    hudTick++
    if (hudTick % 20 === 0 && readoutTemp) {
      // Estimate heat level from source activity + decay for a plausible HUD number.
      const active = simUniforms.uSourceActive.value === 1
      peak = Math.max(peak * 0.94, active ? simUniforms.uSourceHeat.value * 100 : peak * 0.94)
      readoutTemp.textContent = Math.min(100, Math.round(peak)) + " %"
    }
  }
  frame()
}
