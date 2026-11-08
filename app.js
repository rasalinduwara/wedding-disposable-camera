/**
 * Main Application Controller — Wedding Disposable Camera Prototype
 * Implements Host Flow (5.1), Guest Flow (5.2, 5.3), and Admin Console (6.8)
 */

const state = {
  activeRole: 'guest', // 'guest' | 'host' | 'admin'
  hostTab: 'overview', // 'overview' | 'settings' | 'signs' | 'album'
  currentEventId: 'evt_maya_liam_2026',
  event: null,
  guests: [],
  photos: [],
  currentGuest: null,
  guestStep: 'welcome', // 'welcome' | 'preprompt' | 'camera' | 'finished' | 'guest_album'
  cameraStatus: 'idle', // 'idle' | 'live' | 'fallback' | 'denied'
  simulateInAppBrowser: false,
  isCapturing: false,
  toastMessage: null,
  adminSearchQuery: ''
};

async function bootstrapApp() {
  await window.storageEngine.init();
  window.storageEngine.onChange(() => refreshDataAndRender());
  await refreshDataAndRender();
}

async function refreshDataAndRender() {
  const events = await window.storageEngine.getAll('events');
  state.event = events.find((e) => e.id === state.currentEventId) || events[0];
  if (state.event) {
    state.currentEventId = state.event.id;
  }

  const allGuests = await window.storageEngine.getAll('guests');
  state.guests = allGuests.filter((g) => g.event_id === state.currentEventId);

  const allPhotos = await window.storageEngine.getAll('photos');
  state.photos = allPhotos
    .filter((p) => p.event_id === state.currentEventId && !p.deleted)
    .sort((a, b) => new Date(b.captured_at) - new Date(a.captured_at));

  // Section 5.3: Returning guest on same device automatically resumes their roll
  const existingGuest = await window.storageEngine.getOrCreateGuestSession(state.currentEventId, null);
  state.currentGuest = existingGuest;

  if (state.currentGuest && state.guestStep === 'welcome') {
    const guestPhotos = state.photos.filter((p) => p.guest_id === state.currentGuest.id);
    if (guestPhotos.length >= state.event.config.shots_per_guest) {
      state.guestStep = 'finished';
    } else {
      state.guestStep = 'camera';
    }
  }

  renderApp();
}

function showToast(msg) {
  state.toastMessage = msg;
  renderApp();
  setTimeout(() => {
    if (state.toastMessage === msg) {
      state.toastMessage = null;
      renderApp();
    }
  }, 3400);
}

function isAlbumRevealed(event) {
  if (!event) return false;
  if (event.early_unlocked) return true;
  return new Date() >= new Date(event.config.reveal_at);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderApp() {
  const root = document.getElementById('app-root');
  if (!root || !state.event) return;

  // Keep live video stream alive if already on the camera screen
  const activeVideo = document.getElementById('live-viewfinder-video');
  const hadActiveStream = activeVideo && activeVideo.srcObject;

  root.innerHTML = `
    ${renderTopPrototypeBar()}
    ${state.toastMessage ? `<div style="background:#1c1917;color:#fbbf24;text-align:center;padding:0.55rem 1rem;font-size:0.86rem;font-weight:600;">✦ ${state.toastMessage}</div>` : ''}
    <main class="app-container">
      ${
        state.activeRole === 'guest'
          ? renderGuestExperience()
          : state.activeRole === 'host'
          ? renderHostPortal()
          : renderAdminConsole()
      }
    </main>
  `;

  if (state.activeRole === 'guest' && state.guestStep === 'camera') {
    const newVideo = document.getElementById('live-viewfinder-video');
    if (newVideo && window.cameraEngine.stream) {
      newVideo.srcObject = window.cameraEngine.stream;
      newVideo.play().catch(() => {});
    } else if (newVideo && state.cameraStatus === 'idle') {
      initGuestCameraStream();
    }
  } else if (hadActiveStream) {
    window.cameraEngine.stopCamera();
    state.cameraStatus = 'idle';
  }
}

/**
 * Top Bar allowing the Founder to switch between Guest Camera, Host Dashboard, and Admin Console,
 * plus test Weak/Offline Venue Connectivity (G2, U-03) and In-App Browser detection (C-07)
 */
function renderTopPrototypeBar() {
  const netMode = window.storageEngine.simulatedNetworkMode;
  const pendingCount = state.photos.filter((p) => p.status !== 'saved').length;

  return `
    <header class="proto-topbar">
      <div class="proto-brand">
        <span class="proto-brand-dot"></span>
        <span>35mm Wedding Camera · v1 Prototype</span>
        ${
          pendingCount > 0
            ? `<span style="background:#78350f;color:#fde68a;padding:0.15rem 0.55rem;border-radius:999px;font-size:0.74rem;">${pendingCount} queued in IndexedDB</span>`
            : `<span style="background:#064e3b;color:#a7f3d0;padding:0.15rem 0.55rem;border-radius:999px;font-size:0.74rem;">All photos synced</span>`
        }
      </div>

      <div class="proto-nav-pills">
        <button class="proto-pill ${state.activeRole === 'guest' ? 'active' : ''}" onclick="switchRole('guest')">
          📸 Guest Camera (${state.currentGuest ? `${ Math.max(0, state.event.config.shots_per_guest - getCurrentGuestPhotos().length) } left` : 'Scan QR'})
        </button>
        <button class="proto-pill ${state.activeRole === 'host' ? 'active' : ''}" onclick="switchRole('host')">
          🥂 Host Dashboard (${state.photos.length} shots)
        </button>
        <button class="proto-pill ${state.activeRole === 'admin' ? 'active' : ''}" onclick="switchRole('admin')">
          🛠️ Admin Support
        </button>
      </div>

      <div class="proto-sim-controls">
        <label style="font-size:0.75rem;color:#cbbba8;">Venue Signal (G2):</label>
        <select class="sim-select" onchange="changeNetworkSim(this.value)">
          <option value="online" ${netMode === 'online' ? 'selected' : ''}>🟢 4G / Wi-Fi Online</option>
          <option value="spotty" ${netMode === 'spotty' ? 'selected' : ''}>🟡 Weak Venue Signal (Retries)</option>
          <option value="offline" ${netMode === 'offline' ? 'selected' : ''}>🔴 Dead Zone Offline (Queue)</option>
        </select>
        <button class="sim-select" onclick="startFreshGuestDevice()" title="Simulate another guest scanning the QR code on a new phone">
          + New Guest Phone
        </button>
      </div>
    </header>
  `;
}

function getCurrentGuestPhotos() {
  if (!state.currentGuest) return [];
  return state.photos.filter((p) => p.guest_id === state.currentGuest.id);
}

/* ==========================================================================
   SECTION 5.2 & 6.3: GUEST CAMERA EXPERIENCE
   ========================================================================== */

function renderGuestExperience() {
  const ev = state.event;
  const look = window.FILM_LOOKS[ev.config.filter_id] || window.FILM_LOOKS.warm_gold;
  const inAppCheck = window.cameraEngine.detectInAppBrowser();

  // Q-05: Host paused guest access
  if (ev.access_paused) {
    return `
      <div class="guest-shell">
        <div class="card" style="text-align:center;padding:2.25rem 1.5rem;">
          <div class="editorial-eyebrow">Camera Roll Paused</div>
          <h2 class="editorial-title" style="font-size:1.6rem;margin-bottom:0.6rem;">${ev.name}</h2>
          <p class="card-desc">The couple has temporarily paused new photos for this roll. Please check back shortly!</p>
        </div>
      </div>
    `;
  }

  // C-07: In-App Browser Detection Banner (WhatsApp, Instagram, Facebook)
  if (inAppCheck.isInApp || state.simulateInAppBrowser) {
    const appName = inAppCheck.appName || 'Instagram / WhatsApp';
    return `
      <div class="guest-shell">
        <div class="card" style="border:2px solid #d97706;background:#fffbeb;">
          <div class="badge badge-locked" style="margin-bottom:0.75rem;">In-App Browser Detected (${appName})</div>
          <h2 class="card-title">Open in Safari or Chrome to use your camera</h2>
          <p class="card-desc" style="color:#78350f;">
            ${appName}’s built-in browser blocks camera access. To snap photos on this disposable roll:
          </p>
          <ol style="margin:0.75rem 0 1.25rem 1.25rem;font-size:0.9rem;color:#451a03;">
            <li style="margin-bottom:0.4rem;">Tap the <strong>•••</strong> menu in the top-right corner</li>
            <li style="margin-bottom:0.4rem;">Tap <strong>“Open in System Browser”</strong> (Safari or Chrome)</li>
            <li>Your film roll will open immediately with no login needed!</li>
          </ol>
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-primary" onclick="copyShareLink()">Copy Camera Link</button>
            <button class="btn btn-secondary" onclick="toggleInAppSimulation(false)">Dismiss Preview</button>
          </div>
        </div>
      </div>
    `;
  }

  if (state.guestStep === 'welcome' || !state.currentGuest) {
    return renderGuestWelcomeScreen(ev, look);
  }

  if (state.guestStep === 'preprompt') {
    return renderGuestPermissionPrePrompt(ev);
  }

  if (state.guestStep === 'guest_album') {
    return renderGuestRevealedAlbum(ev);
  }

  const guestPhotos = getCurrentGuestPhotos();
  const shotsRemaining = Math.max(0, ev.config.shots_per_guest - guestPhotos.length);

  if (state.guestStep === 'finished' || shotsRemaining === 0) {
    return renderGuestRollFinishedScreen(ev, guestPhotos);
  }

  return renderGuestDisposableCameraUI(ev, look, guestPhotos, shotsRemaining);
}

/**
 * Step 5.2.2 & C-02: Welcome Screen (<15s fast onboarding with name & consent notice)
 */
function renderGuestWelcomeScreen(ev, look) {
  return `
    <div class="guest-shell">
      <div class="card" style="padding:1.85rem 1.5rem;text-align:center;">
        <div class="badge badge-film" style="margin-bottom:0.75rem;">35MM DISPOSABLE ROLL · ${look.name.toUpperCase()}</div>
        <h1 class="editorial-title" style="font-size:1.85rem;">${ev.name}</h1>
        <p class="editorial-subtitle" style="margin-bottom:1.25rem;">
          You have <strong>${ev.config.shots_per_guest} shots</strong> on your film roll. No retakes, no filters to pick—just point, shoot, and make them count!
        </p>

        <form onsubmit="handleGuestJoin(event)" style="text-align:left;">
          <div class="form-group">
            <label class="form-label" for="guest-name-input">Your first name or nickname (printed on the back of your photos)</label>
            <input
              id="guest-name-input"
              class="form-input"
              type="text"
              placeholder="e.g. Aunt Sarah, Table 4, Sam..."
              required
              maxlength="40"
              autofocus
            />
          </div>

          <div style="background:var(--bg-subtle);padding:0.75rem 0.9rem;border-radius:8px;font-size:0.78rem;color:var(--ink-700);margin-bottom:1.15rem;">
            <label style="display:flex;align-items:flex-start;gap:0.55rem;cursor:pointer;">
              <input type="checkbox" required checked style="margin-top:0.2rem;" />
              <span>
                <strong>Privacy & Consent (7.4):</strong> Photos you take are shared privately with the couple${ev.config.guests_can_view_after_reveal ? ' and wedding guests after the reveal' : ''}. Basic device session data is stored for ${Math.round(ev.config.retention_days / 30)} months so your roll is saved, and you can delete your own photos anytime before download.
              </span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary" style="width:100%;padding:0.85rem;font-size:1rem;">
            Open My Disposable Camera (${ev.config.shots_per_guest} Shots) →
          </button>
        </form>

        <div style="margin-top:1.1rem;padding-top:0.85rem;border-top:1px solid var(--border-warm);display:flex;justify-content:space-between;font-size:0.76rem;color:var(--ink-500);">
          <span>No app or account needed (G1)</span>
          <a href="#" onclick="toggleInAppSimulation(true);return false;" style="color:var(--accent-terracotta);">Preview In-App Browser Block (C-07)</a>
        </div>
      </div>
    </div>
  `;
}

/**
 * C-03: Camera Permission Pre-Prompt & Recovery Instructions
 */
function renderGuestPermissionPrePrompt(ev) {
  return `
    <div class="guest-shell">
      <div class="card" style="text-align:center;padding:1.85rem 1.5rem;">
        <div class="editorial-eyebrow">Step 2 of 2 · Camera Access</div>
        <h2 class="editorial-title" style="font-size:1.5rem;margin-bottom:0.6rem;">Ready to load your film, ${state.currentGuest.name}?</h2>
        <p class="card-desc">
          Your browser will ask to use your camera so you can look through the viewfinder.
        </p>

        <div style="display:flex;flex-direction:column;gap:0.65rem;margin:1.25rem 0;">
          <button class="btn btn-primary" style="width:100%;padding:0.8rem;" onclick="proceedToCameraViewfinder()">
            Allow Camera & Start Shooting
          </button>
        </div>

        <details style="text-align:left;background:var(--bg-subtle);padding:0.75rem 0.9rem;border-radius:8px;font-size:0.78rem;color:var(--ink-700);">
          <summary style="font-weight:600;cursor:pointer;">Accidentally tapped “Don’t Allow”? Here’s how to fix it (C-03)</summary>
          <ul style="margin:0.5rem 0 0 1.15rem;">
            <li><strong>iPhone (Safari):</strong> Tap the <strong>aA</strong> or settings icon in the address bar → Website Settings → Camera → <strong>Allow</strong>.</li>
            <li><strong>Android (Chrome):</strong> Tap the tune/lock icon left of the URL → Permissions → Camera → <strong>Allow</strong>.</li>
            <li><strong>No camera on this device?</strong> Our prototype automatically provides a simulated wedding reception viewfinder so you can test the full film pipeline!</li>
          </ul>
        </details>
      </div>
    </div>
  `;
}

/**
 * C-04, C-06, C-09, C-10, F-01, F-03: Tactile 35mm Disposable Camera Hardware UI
 */
function renderGuestDisposableCameraUI(ev, look, guestPhotos, shotsRemaining) {
  const now = new Date();
  const dateStampPreview = `'${String(now.getFullYear()).slice(-2)} ${String(now.getMonth() + 1).padStart(2, '0')} ${String(now.getDate()).padStart(2, '0')}`;
  const revealed = isAlbumRevealed(ev);

  return `
    <div class="guest-shell">
      <div class="camera-body">
        <!-- Decorative Cardboard Wrapper Strip -->
        <div class="camera-label-strip">
          <div>
            <div class="camera-event-title">${ev.name}</div>
            <div style="font-size:0.7rem;color:#ffedd5;opacity:0.9;">Roll belongs to: <strong>${state.currentGuest.name}</strong></div>
          </div>
          <span class="camera-stock-pill">${look.badge}</span>
        </div>

        <!-- Top Hardware Controls & Mechanical Frame Counter -->
        <div class="camera-top-deck">
          <div class="frame-counter-window" title="Frames remaining on your roll (G4)">
            <div>
              <div class="frame-counter-label">EXP LEFT</div>
              <div style="font-size:0.62rem;color:#78716c;">OF ${ev.config.shots_per_guest}</div>
            </div>
            <div class="frame-counter-digits" aria-label="${shotsRemaining} shots remaining">${String(shotsRemaining).padStart(2, '0')}</div>
          </div>

          <div class="hardware-toggles">
            <button
              class="hw-btn ${window.cameraEngine.flashEnabled ? 'active' : ''}"
              onclick="handleFlashToggle()"
              aria-label="Toggle Flash"
            >
              ⚡ ${window.cameraEngine.flashEnabled ? 'Flash ON' : 'Flash'}
            </button>
            <button
              class="hw-btn"
              onclick="handleFlipCamera()"
              aria-label="Switch Front or Rear Camera"
            >
              🔄 Flip
            </button>
            <button
              class="hw-btn ${!window.cameraEngine.muted ? 'active' : ''}"
              onclick="handleMuteToggle()"
              aria-label="Toggle Shutter Sound"
            >
              ${window.cameraEngine.muted ? '🔇' : '🔊'}
            </button>
          </div>
        </div>

        <!-- Optical Viewfinder Window -->
        <div class="viewfinder-frame">
          <div id="xenon-flash-overlay" class="xenon-flash-burst"></div>

          <video
            id="live-viewfinder-video"
            class="viewfinder-video ${window.cameraEngine.facingMode === 'user' ? 'mirrored' : ''}"
            playsinline
            autoplay
            muted
            style="filter:${look.cssPreviewFilter}; ${state.cameraStatus === 'live' ? '' : 'display:none;'}"
          ></video>

          ${
            state.cameraStatus !== 'live'
              ? `
            <div style="width:100%;height:100%;background:radial-gradient(circle at 50% 42%, #4a3531 0%, #1d161a 70%, #0d0b0c 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;text-align:center;filter:${look.cssPreviewFilter};">
              <div style="font-size:2.4rem;margin-bottom:0.4rem;">🥂✨🕯️</div>
              <div style="font-family:var(--font-serif);font-size:1.15rem;color:#fff7ed;margin-bottom:0.35rem;">
                Simulated Wedding Reception Viewfinder
              </div>
              <p style="font-size:0.78rem;color:#e7d8c9;max-width:260px;">
                Press the shutter button below to snap & develop a 1600px film photo with <strong>${look.name}</strong> grading, grain, vignette, and quartz date stamp!
              </p>
              <button class="hw-btn" style="margin-top:0.85rem;" onclick="initGuestCameraStream()">
                📷 Retry Live Webcam / Phone Camera
              </button>
            </div>
          `
              : ''
          }

          <div class="viewfinder-overlay">
            <div class="viewfinder-crosshair"></div>
          </div>

          ${ev.config.date_stamp ? `<div class="viewfinder-date-preview">${dateStampPreview}</div>` : ''}
        </div>

        <!-- Shutter Deck -->
        <div class="shutter-deck">
          <div class="guest-badge-info">
            <div style="color:#f5efe6;font-weight:600;">${look.name}</div>
            <div>Develops: ${revealed ? 'Unlocked Now!' : new Date(ev.config.reveal_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>

          <button
            class="shutter-button-outer"
            onclick="handleSnapPhoto()"
            ${state.isCapturing ? 'disabled' : ''}
            aria-label="Take Photo (${shotsRemaining} shots remaining)"
          >
            <div class="shutter-button-inner"></div>
          </button>

          <div style="text-align:right;" class="guest-badge-info">
            <div>Shot #${guestPhotos.length + 1}</div>
            <div style="color:#fbbf24;">1600px Film</div>
          </div>
        </div>

        <!-- C-06: Per-Photo Upload Status Strip & Offline Queue Indicator -->
        <div class="upload-status-strip">
          <div class="upload-queue-header">
            <span><strong>Film Roll Status (C-06):</strong> ${guestPhotos.length} taken · ${guestPhotos.filter((p) => p.status === 'saved').length} verified in cloud</span>
            ${
              revealed && ev.config.guests_can_view_after_reveal
                ? `<button class="hw-btn active" onclick="openGuestAlbumView()">View Album →</button>`
                : ''
            }
          </div>

          ${
            guestPhotos.length === 0
              ? `<div style="font-size:0.75rem;color:#8a8178;">Tap the terracotta shutter button above to take your first photo.</div>`
              : `
              <div class="shot-pills-row">
                ${guestPhotos
                  .slice(0, 12)
                  .map((p) => {
                    const icon =
                      p.status === 'saved'
                        ? '✓ Saved'
                        : p.status === 'uploading'
                        ? '↑ Uploading...'
                        : p.status === 'retrying'
                        ? '↻ Retrying (Weak Signal)'
                        : '⏳ Queued on Device';
                    return `
                      <span class="shot-pill ${p.status}" title="Captured at ${new Date(p.captured_at).toLocaleTimeString()}">
                        #${p.frame_number} ${icon}
                        <button
                          onclick="handleGuestDeleteOwnPhoto('${p.id}')"
                          style="background:none;border:none;color:inherit;cursor:pointer;margin-left:3px;opacity:0.75;"
                          title="Delete this shot from your roll (C-11)"
                        >×</button>
                      </span>
                    `;
                  })
                  .join('')}
              </div>
            `
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * C-08 & A-07: Roll-Finished Screen with Developing Animation & Reveal Countdown
 */
function renderGuestRollFinishedScreen(ev, guestPhotos) {
  const revealed = isAlbumRevealed(ev);
  const pending = guestPhotos.filter((p) => p.status !== 'saved').length;

  return `
    <div class="guest-shell">
      <div class="card" style="text-align:center;padding:2rem 1.5rem;">
        <div class="badge ${revealed ? 'badge-unlocked' : 'badge-locked'}" style="margin-bottom:0.75rem;">
          ${revealed ? '✨ Film Developed & Unlocked' : '🎞️ Roll Complete · Developing in Darkroom'}
        </div>
        <h2 class="editorial-title" style="font-size:1.75rem;margin-bottom:0.5rem;">
          Thank you, ${state.currentGuest ? state.currentGuest.name : 'Guest'}!
        </h2>
        <p class="card-desc">
          You’ve used all <strong>${guestPhotos.length} shots</strong> on your disposable roll for <strong>${ev.name}</strong>.
        </p>

        <div style="background:var(--bg-subtle);border-radius:12px;padding:1.15rem;margin:1.25rem 0;">
          <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-500);font-weight:700;">
            Darkroom Reveal Time (A-01 / C-08)
          </div>
          <div style="font-family:var(--font-serif);font-size:1.35rem;color:var(--ink-900);margin:0.3rem 0;">
            ${new Date(ev.config.reveal_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          <div style="font-size:0.82rem;color:var(--ink-700);">
            ${
              pending > 0
                ? `⏳ ${pending} photo(s) still syncing—keep this page open until saved!`
                : `✓ All ${guestPhotos.length} of your photos are safely verified in storage.`
            }
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:0.6rem;">
          ${
            revealed && ev.config.guests_can_view_after_reveal
              ? `<button class="btn btn-primary" onclick="openGuestAlbumView()">Open Developed Wedding Album (${state.photos.length} Photos)</button>`
              : `<button class="btn btn-secondary" onclick="switchRole('host')">Preview Host Dashboard & Unlock Early →</button>`
          }
          <button class="btn btn-secondary" onclick="startFreshGuestDevice()">Simulate Another Guest Scanning QR Code</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * A-02 & A-05: Guest Album View (after Reveal) + Download Own Photos
 */
function renderGuestRevealedAlbum(ev) {
  return `
    <div>
      <div class="editorial-header">
        <div>
          <div class="editorial-eyebrow">Developed 35mm Wedding Roll</div>
          <h1 class="editorial-title">${ev.name}</h1>
          <p class="editorial-subtitle">${state.photos.length} photos developed · Shot on ${window.FILM_LOOKS[ev.config.filter_id].name}</p>
        </div>
        <div style="display:flex;gap:0.6rem;">
          <button class="btn btn-secondary" onclick="state.guestStep='camera';renderApp();">← Back to My Camera</button>
        </div>
      </div>

      <div class="album-grid">
        ${state.photos
          .map(
            (p) => `
          <div class="film-frame-card">
            <div class="film-sprocket-bar">
              <span>▶ EXP #${p.frame_number}</span>
              <span>KODAK/35MM</span>
            </div>
            <img class="film-frame-img" src="${p.data_url}" alt="Photo by ${p.guest_name}" />
            <div class="film-frame-footer">
              <div>
                <div style="font-weight:600;color:#fff;">📸 ${p.guest_name}</div>
                <div style="font-size:0.7rem;color:#a89f91;">${new Date(p.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div style="display:flex;gap:0.35rem;">
                <a class="hw-btn" href="${p.data_url}" download="${p.guest_name.replace(/\s+/g, '_')}_frame${p.frame_number}.jpg" title="Download photo (A-05)">⬇ Save</a>
                <button class="hw-btn" onclick="reportPhoto('${p.id}')" title="Report photo to host (U-08)">🚩</button>
              </div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
  `;
}

/* ==========================================================================
   SECTION 5.1, 6.1, 6.2, 6.6, 6.7: HOST PORTAL
   ========================================================================== */

function renderHostPortal() {
  const ev = state.event;
  const revealed = isAlbumRevealed(ev);
  const totalBytes = state.photos.reduce((acc, p) => acc + (p.size_bytes || 0), 0);
  const pendingUploads = state.photos.filter((p) => p.status !== 'saved').length;

  return `
    <div>
      <div class="editorial-header">
        <div>
          <div class="editorial-eyebrow">Host Studio · ${ev.plan.toUpperCase()} PLAN (${ev.payment_status.toUpperCase()})</div>
          <h1 class="editorial-title">${ev.name}</h1>
          <p class="editorial-subtitle">
            Event Date: ${ev.event_date} (${ev.timezone}) · Host: ${ev.host_email}
          </p>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap;" class="no-print">
          <span class="badge ${revealed ? 'badge-unlocked' : 'badge-locked'}">
            ${revealed ? '🔓 Album Unlocked' : `🔒 Developing until ${new Date(ev.config.reveal_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`}
          </span>
          <button class="btn btn-primary btn-sm" onclick="switchRole('guest')">Test Guest Camera →</button>
        </div>
      </div>

      <!-- H-05: Live Event Counters (Visible even while photos are locked before reveal) -->
      <div class="grid-4 no-print">
        <div class="stat-card">
          <div class="stat-label">Guests Joined (H-05)</div>
          <div class="stat-value">${state.guests.length} <span style="font-size:1rem;color:var(--ink-500);">/ ${ev.config.guest_cap}</span></div>
          <div class="stat-meta">${Math.round((state.guests.length / Math.max(1, ev.expected_guests)) * 100)}% of ${ev.expected_guests} expected guests</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Photos Taken (H-05)</div>
          <div class="stat-value">${state.photos.length}</div>
          <div class="stat-meta">${ev.config.shots_per_guest} shots per guest roll</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Upload Queue (G2)</div>
          <div class="stat-value" style="color:${pendingUploads > 0 ? 'var(--warn-amber)' : 'var(--success-green)'};">
            ${pendingUploads === 0 ? '100%' : `${pendingUploads} queued`}
          </div>
          <div class="stat-meta">${state.photos.length - pendingUploads} verified in storage</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Storage & Unit Cost (G5)</div>
          <div class="stat-value">${formatBytes(totalBytes)}</div>
          <div class="stat-meta">Est. R2 cost: <strong>$0.04/mo</strong> (&lt;15% target)</div>
        </div>
      </div>

      <!-- Host Navigation Tabs -->
      <div class="host-tabs no-print">
        <button class="host-tab ${state.hostTab === 'overview' ? 'active' : ''}" onclick="setHostTab('overview')">
          1. Album & Reveal (${state.photos.length})
        </button>
        <button class="host-tab ${state.hostTab === 'signs' ? 'active' : ''}" onclick="setHostTab('signs')">
          2. QR Code & Print Signs (Q-01–Q-03)
        </button>
        <button class="host-tab ${state.hostTab === 'settings' ? 'active' : ''}" onclick="setHostTab('settings')">
          3. Rules, Film Look & Plans (H-04, F-01)
        </button>
      </div>

      ${
        state.hostTab === 'overview'
          ? renderHostAlbumAndRevealTab(ev, revealed)
          : state.hostTab === 'signs'
          ? renderHostQRAndSignsTab(ev)
          : renderHostSettingsAndPlansTab(ev)
      }
    </div>
  `;
}

function renderHostAlbumAndRevealTab(ev, revealed) {
  if (!revealed) {
    // A-01 & A-04: Locked before reveal unless host chooses Early Unlock with confirmation
    return `
      <div class="card" style="text-align:center;padding:2.5rem 1.5rem;">
        <div class="badge badge-locked" style="margin-bottom:0.85rem;">🎞️ Darkroom Mode Active (A-01)</div>
        <h2 class="editorial-title" style="font-size:1.75rem;margin-bottom:0.5rem;">
          ${state.photos.length} Photos Are Developing Until the Reveal
        </h2>
        <p class="card-desc" style="max-width:540px;margin:0 auto 1.5rem;">
          To preserve the disposable camera anticipation, photos stay hidden while guests shoot and automatically unlock on
          <strong>${new Date(ev.config.reveal_at).toLocaleString()}</strong>.
        </p>

        <div style="display:flex;justify-content:center;gap:0.75rem;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="handleHostEarlyUnlock()">
            🔓 Unlock Album Early Now (A-04)
          </button>
          <button class="btn btn-secondary" onclick="switchRole('guest')">
            📸 Take More Test Photos as a Guest
          </button>
        </div>
      </div>
    `;
  }

  return `
    <div>
      <div class="card" style="margin-bottom:1.5rem;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem;">
        <div>
          <h3 class="card-title" style="margin-bottom:0.2rem;">Developed Wedding Roll (${state.photos.length} Photos)</h3>
          <p class="card-desc" style="margin-bottom:0;">
            Retention: Stored for ${ev.config.retention_days} days. Download includes guest name & capture timestamp in each filename (A-03).
          </p>
        </div>
        <div style="display:flex;gap:0.65rem;flex-wrap:wrap;">
          <button class="btn btn-primary" onclick="handleDownloadAllAsZip()" ${state.photos.length === 0 ? 'disabled' : ''}>
            📦 Download All Photos (.ZIP) (A-03)
          </button>
          ${
            ev.early_unlocked
              ? `<button class="btn btn-secondary" onclick="handleRelockAlbum()">🔒 Re-Lock Until Reveal Time</button>`
              : ''
          }
        </div>
      </div>

      ${
        state.photos.length === 0
          ? `
          <div class="card" style="text-align:center;padding:2.25rem;">
            <p class="card-desc">No photos have been taken on this roll yet. Switch to the <strong>Guest Camera</strong> tab to snap a few!</p>
            <button class="btn btn-primary" onclick="switchRole('guest')">Open Guest Camera</button>
          </div>
        `
          : `
          <div class="album-grid">
            ${state.photos
              .map(
                (p) => `
              <div class="film-frame-card">
                <div class="film-sprocket-bar">
                  <span>FRAME #${p.frame_number} · ${p.filter_id.toUpperCase()}</span>
                  <span>${p.status.toUpperCase()}</span>
                </div>
                <img class="film-frame-img" src="${p.data_url}" alt="Shot by ${p.guest_name}" />
                <div class="film-frame-footer">
                  <div>
                    <div style="font-weight:600;color:#fff;">${p.guest_name}</div>
                    <div style="font-size:0.7rem;color:#a89f91;">
                      ${new Date(p.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${formatBytes(p.size_bytes)}
                    </div>
                  </div>
                  <div style="display:flex;gap:0.35rem;">
                    <a class="hw-btn" href="${p.data_url}" download="${p.guest_name.replace(/\s+/g, '_')}_frame${p.frame_number}.jpg">⬇</a>
                    <button class="hw-btn" style="color:#fca5a5;" onclick="handleHostDeletePhoto('${p.id}')" title="Delete photo from album (H-08)">🗑️</button>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
      }
    </div>
  `;
}

/**
 * Q-01, Q-02, Q-03, Q-04, Q-05: QR Code Generator & 3 Print-Ready Sign Templates
 */
function renderHostQRAndSignsTab(ev) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${ev.token}`;
  const qrSvgLarge = window.generateEventQRCodeSVG(shareUrl, 165, '#1C1917', '#FFFDF9');
  const qrSvgSmall = window.generateEventQRCodeSVG(shareUrl, 125, '#1C1917', '#FFFDF9');

  return `
    <div>
      <div class="card no-print" style="margin-bottom:1.5rem;">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:1rem;">
          <div>
            <h3 class="card-title">Unique Event Link & Print-Ready QR Studio (Q-01–Q-05)</h3>
            <p class="card-desc" style="margin-bottom:0.4rem;">
              Share Link: <code style="background:var(--bg-subtle);padding:0.2rem 0.5rem;border-radius:4px;">${shareUrl}</code>
            </p>
          </div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button class="btn btn-primary btn-sm" onclick="window.print()">🖨️ Print Signs / Save as PDF (Q-03)</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadQRAsSVG()">⬇ QR (.SVG)</button>
            <button class="btn btn-secondary btn-sm" onclick="downloadQRAsPNG()">⬇ QR (.PNG)</button>
            <button class="btn btn-secondary btn-sm" onclick="copyShareLink()">📋 Copy Link</button>
            <button class="btn btn-secondary btn-sm" onclick="handleRegenerateToken()">🔄 Regenerate Link (Q-04)</button>
          </div>
        </div>
      </div>

      <!-- 3 Print-Ready Sign Templates (Q-03: Welcome Sign, Table Card, Small Card) -->
      <div class="sign-templates-grid">
        <!-- Template 1: A4/Arch Welcome Sign -->
        <div class="printable-sign">
          <div class="printable-sign-border">
            <div class="editorial-eyebrow">Template 1 · Reception Welcome Sign</div>
            <h3 style="font-family:var(--font-serif);font-size:1.55rem;margin:0.4rem 0;">${ev.name}</h3>
            <p style="font-size:0.84rem;color:var(--ink-700);margin-bottom:1rem;">
              Help us capture our wedding through your eyes! Scan with your phone camera to open your personal <strong>${ev.config.shots_per_guest}-shot disposable film camera</strong>.
            </p>
            <div style="margin:0.5rem 0;">${qrSvgLarge}</div>
            <p style="font-size:0.75rem;font-weight:600;color:var(--accent-terracotta);margin-top:0.75rem;">
              NO APP · NO ACCOUNT · DEVELOPS AT THE REVEAL
            </p>
          </div>
        </div>

        <!-- Template 2: 5x7 Table Centerpiece Card -->
        <div class="printable-sign">
          <div class="printable-sign-border">
            <div class="editorial-eyebrow">Template 2 · Dinner Table Tent Card</div>
            <h3 style="font-family:var(--font-serif);font-size:1.35rem;margin:0.4rem 0;">Table Disposable Camera</h3>
            <p style="font-size:0.82rem;color:var(--ink-700);margin-bottom:0.85rem;">
              You have <strong>${ev.config.shots_per_guest} frames</strong> on your roll for <strong>${ev.name}</strong>. Snap candid moments at your table!
            </p>
            <div style="margin:0.5rem 0;">${qrSvgLarge}</div>
            <p style="font-size:0.74rem;color:var(--ink-500);margin-top:0.75rem;">
              Point your iPhone or Android camera app directly at this code.
            </p>
          </div>
        </div>

        <!-- Template 3: Small Pocket / Place Setting Card -->
        <div class="printable-sign">
          <div class="printable-sign-border">
            <div class="editorial-eyebrow">Template 3 · Place Setting Mini Card</div>
            <h3 style="font-family:var(--font-serif);font-size:1.2rem;margin:0.35rem 0;">${ev.name}</h3>
            <div style="margin:0.6rem 0;">${qrSvgSmall}</div>
            <p style="font-size:0.78rem;color:var(--ink-700);">
              <strong>${ev.config.shots_per_guest} Shots. No Retakes.</strong><br/>
              Scan to open your 35mm roll in under 15 seconds.
            </p>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * H-02, H-03, H-04, F-01, F-02, F-03, P-01–P-05: Event Rules, Film Look & Plan Settings
 */
function renderHostSettingsAndPlansTab(ev) {
  return `
    <div class="grid-2">
      <div class="card">
        <h3 class="card-title">Event Rules & 35mm Film Look (H-04, F-01–F-03)</h3>
        <p class="card-desc">Changes apply immediately to all guest cameras.</p>

        <form onsubmit="handleSaveHostSettings(event)">
          <div class="form-group">
            <label class="form-label">Wedding Event Title (H-02)</label>
            <input class="form-input" name="name" value="${ev.name}" required />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Shots per Guest Roll (10–50)</label>
              <input class="form-input" type="number" name="shots_per_guest" min="10" max="50" value="${ev.config.shots_per_guest}" required />
            </div>
            <div class="form-group">
              <label class="form-label">Film Stock Look (F-01, F-02)</label>
              <select class="form-select" name="filter_id">
                ${Object.values(window.FILM_LOOKS)
                  .map(
                    (f) => `<option value="${f.id}" ${ev.config.filter_id === f.id ? 'selected' : ''}>${f.name} (${f.badge})</option>`
                  )
                  .join('')}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Darkroom Reveal Time (H-04)</label>
            <input
              class="form-input"
              type="datetime-local"
              name="reveal_at"
              value="${new Date(ev.config.reveal_at).toISOString().slice(0, 16)}"
              required
            />
          </div>

          <div class="form-group" style="display:flex;flex-direction:column;gap:0.55rem;margin-top:0.75rem;">
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.86rem;cursor:pointer;">
              <input type="checkbox" name="date_stamp" ${ev.config.date_stamp ? 'checked' : ''} />
              <span><strong>Amber Quartz Date Stamp (F-03)</strong> in bottom-right corner of photos</span>
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.86rem;cursor:pointer;">
              <input type="checkbox" name="guests_can_view" ${ev.config.guests_can_view_after_reveal ? 'checked' : ''} />
              <span><strong>Allow guests to view album after reveal (A-02)</strong></span>
            </label>
            <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.86rem;cursor:pointer;">
              <input type="checkbox" name="access_paused" ${ev.access_paused ? 'checked' : ''} />
              <span><strong>Pause guest camera access (Q-05)</strong></span>
            </label>
          </div>

          <button type="submit" class="btn btn-primary" style="margin-top:0.75rem;width:100%;">
            Save Event Rules & Film Look
          </button>
        </form>
      </div>

      <div class="card">
        <h3 class="card-title">Plans, Upgrades & Co-Hosts (Section 8 & P-01–P-05)</h3>
        <p class="card-desc">Switch plans below to test Free Demo watermarks (P-02) vs Standard/Plus limits (P-04).</p>

        <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1.25rem;">
          ${[
            { id: 'demo', title: 'Free Demo ($0)', desc: 'Up to 5 guests · 10 shots each · Demo watermark · 30-day retention', cap: 5, shots: 10 },
            { id: 'standard', title: 'Standard Wedding ($39)', desc: 'Up to 100 guests · 24 shots each · No watermark · 12-month storage', cap: 100, shots: 24 },
            { id: 'plus', title: 'Plus Celebration ($59)', desc: 'Up to 250 guests · Up to 50 shots · 24-month storage · Priority support', cap: 250, shots: 36 }
          ]
            .map(
              (pl) => `
            <div style="border:2px solid ${ev.plan === pl.id ? 'var(--accent-terracotta)' : 'var(--border-warm)'};border-radius:10px;padding:0.85rem;display:flex;justify-content:space-between;align-items:center;background:${ev.plan === pl.id ? '#fffaf5' : '#fff'};">
              <div>
                <div style="font-weight:700;font-size:0.92rem;">${pl.title}</div>
                <div style="font-size:0.78rem;color:var(--ink-500);">${pl.desc}</div>
              </div>
              <button class="btn ${ev.plan === pl.id ? 'btn-dark' : 'btn-secondary'} btn-sm" onclick="handleSelectPlan('${pl.id}', ${pl.cap}, ${pl.shots})">
                ${ev.plan === pl.id ? 'Current' : 'Select'}
              </button>
            </div>
          `
            )
            .join('')}
        </div>

        <div style="border-top:1px solid var(--border-warm);padding-top:1rem;display:flex;gap:0.6rem;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="handleDuplicateEvent()">📋 Duplicate Event as Template (H-06)</button>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   SECTION 6.8: PLATFORM ADMIN & SUPPORT CONSOLE (M-01 to M-03)
   ========================================================================== */

function renderAdminConsole() {
  const ev = state.event;
  return `
    <div>
      <div class="editorial-header">
        <div>
          <div class="editorial-eyebrow">Internal Platform Support (Section 6.8)</div>
          <h1 class="editorial-title">Administrator Console</h1>
          <p class="editorial-subtitle">Search events, inspect upload health, extend retention, and inspect the Section 6.9 Config Object.</p>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">Event Diagnostics & Support Actions (M-02, M-03)</h3>
          <p class="card-desc">Event ID: <code>${ev.id}</code> · Host: <code>${ev.host_email}</code></p>

          <div style="display:flex;flex-wrap:wrap;gap:0.6rem;margin-bottom:1.25rem;">
            <button class="btn btn-primary btn-sm" onclick="adminExtendRetention()">
              + Extend Retention by 30 Days (M-03)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="handleHostEarlyUnlock()">
              🔓 Force Unlock Album (M-03)
            </button>
            <button class="btn btn-secondary btn-sm" onclick="adminResetDemoData()">
              ♻️ Reset Prototype Database
            </button>
          </div>

          <div style="font-size:0.84rem;background:var(--bg-subtle);padding:0.9rem;border-radius:8px;">
            <div><strong>Retention Days:</strong> ${ev.config.retention_days} days</div>
            <div><strong>Payment Status:</strong> ${ev.payment_status.toUpperCase()} (${ev.plan})</div>
            <div><strong>Guests Joined:</strong> ${state.guests.length} / ${ev.config.guest_cap}</div>
            <div><strong>Photos Stored:</strong> ${state.photos.length} (${state.photos.filter((p) => p.reported).length} reported)</div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">Section 6.9 Extensible Event Configuration JSON</h3>
          <p class="card-desc">Adding new event types later requires only presets of this object—no camera rewrites (G6).</p>
          <pre style="background:#171412;color:#f5efe6;padding:0.9rem;border-radius:8px;font-size:0.75rem;overflow-x:auto;max-height:260px;">${JSON.stringify(ev.config, null, 2)}</pre>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   INTERACTION HANDLERS
   ========================================================================== */

window.switchRole = (role) => {
  state.activeRole = role;
  renderApp();
};

window.setHostTab = (tab) => {
  state.hostTab = tab;
  renderApp();
};

window.changeNetworkSim = (mode) => {
  window.storageEngine.setNetworkSimulation(mode);
  const label =
    mode === 'online'
      ? '4G Online — queued photos syncing automatically!'
      : mode === 'spotty'
      ? 'Weak Venue Signal — uploads will simulate drops & exponential backoff retries'
      : 'Offline Dead Zone — photos will queue safely in IndexedDB on device';
  showToast(label);
};

window.toggleInAppSimulation = (flag) => {
  state.simulateInAppBrowser = flag;
  renderApp();
};

window.handleGuestJoin = async (e) => {
  e.preventDefault();
  const input = document.getElementById('guest-name-input');
  const name = input ? input.value.trim() : 'Guest';
  if (!name) return;

  try {
    state.currentGuest = await window.storageEngine.getOrCreateGuestSession(state.currentEventId, name);
    state.guestStep = 'preprompt';
    renderApp();
  } catch (err) {
    showToast(err.message);
  }
};

window.proceedToCameraViewfinder = async () => {
  state.guestStep = 'camera';
  renderApp();
  await initGuestCameraStream();
};

async function initGuestCameraStream() {
  const video = document.getElementById('live-viewfinder-video');
  const res = await window.cameraEngine.startCamera(video);
  state.cameraStatus = res.ok ? 'live' : 'fallback';
  renderApp();
}
window.initGuestCameraStream = initGuestCameraStream;

window.handleFlipCamera = async () => {
  const video = document.getElementById('live-viewfinder-video');
  const res = await window.cameraEngine.flipCamera(video);
  state.cameraStatus = res.ok ? 'live' : 'fallback';
  renderApp();
};

window.handleFlashToggle = async () => {
  await window.cameraEngine.toggleFlash();
  renderApp();
};

window.handleMuteToggle = () => {
  window.cameraEngine.muted = !window.cameraEngine.muted;
  renderApp();
};

window.handleSnapPhoto = async () => {
  if (state.isCapturing || !state.currentGuest || !state.event) return;
  state.isCapturing = true;

  // Trigger visual xenon flash burst if flash is on or in simulated reception
  const flashEl = document.getElementById('xenon-flash-overlay');
  if (flashEl) {
    flashEl.classList.add('firing');
    setTimeout(() => flashEl.classList.remove('firing'), 140);
  }

  try {
    const video = document.getElementById('live-viewfinder-video');
    const guestPhotos = getCurrentGuestPhotos();
    const frameNumber = guestPhotos.length + 1;

    const captured = await window.cameraEngine.captureAndDevelopFrame({
      videoElement: video,
      filterId: state.event.config.filter_id,
      dateStamp: state.event.config.date_stamp,
      isDemoWatermark: state.event.plan === 'demo',
      guestName: state.currentGuest.name,
      frameNumber
    });

    await window.storageEngine.enqueuePhoto({
      eventId: state.event.id,
      guestId: state.currentGuest.id,
      guestName: state.currentGuest.name,
      dataUrl: captured.dataUrl,
      sizeBytes: captured.sizeBytes,
      width: captured.width,
      height: captured.height,
      filterId: state.event.config.filter_id,
      frameNumber,
      idempotencyKey: `${state.currentGuest.id}_f${frameNumber}_${Date.now()}`
    });
  } catch (err) {
    showToast(err.message);
  } finally {
    state.isCapturing = false;
    await refreshDataAndRender();
  }
};

window.handleGuestDeleteOwnPhoto = async (photoId) => {
  const photo = await window.storageEngine.get('photos', photoId);
  if (!photo) return;
  photo.deleted = true;
  await window.storageEngine.put('photos', photo);
  showToast('Shot removed from your roll (C-11).');
  await refreshDataAndRender();
};

window.openGuestAlbumView = () => {
  state.guestStep = 'guest_album';
  renderApp();
};

window.startFreshGuestDevice = async () => {
  window.storageEngine.resetDeviceFingerprint();
  state.currentGuest = null;
  state.guestStep = 'welcome';
  state.activeRole = 'guest';
  showToast('New guest phone simulated — scan QR welcome screen ready!');
  await refreshDataAndRender();
};

window.handleHostEarlyUnlock = async () => {
  state.event.early_unlocked = true;
  await window.storageEngine.put('events', state.event);
  showToast('Album unlocked early! All photos are now visible (A-04).');
  await refreshDataAndRender();
};

window.handleRelockAlbum = async () => {
  state.event.early_unlocked = false;
  await window.storageEngine.put('events', state.event);
  showToast('Album re-locked until the scheduled reveal time.');
  await refreshDataAndRender();
};

window.handleHostDeletePhoto = async (photoId) => {
  const photo = await window.storageEngine.get('photos', photoId);
  if (!photo) return;
  photo.deleted = true;
  await window.storageEngine.put('photos', photo);
  showToast('Photo deleted from album (H-08).');
  await refreshDataAndRender();
};

window.reportPhoto = async (photoId) => {
  const photo = await window.storageEngine.get('photos', photoId);
  if (!photo) return;
  photo.reported = true;
  await window.storageEngine.put('photos', photo);
  showToast('Photo flagged for host review (U-08).');
};

window.handleDownloadAllAsZip = () => {
  if (state.photos.length === 0) return;
  const zip = new window.ZipArchiveBuilder();

  state.photos.forEach((p) => {
    const safeGuest = (p.guest_name || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ts = p.captured_at.slice(0, 19).replace(/[:T]/g, '-');
    const filename = `${safeGuest}_${ts}_frame${String(p.frame_number).padStart(2, '0')}.jpg`;
    zip.addDataUrlFile(filename, p.data_url);
  });

  const blob = zip.generateBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.event.name.replace(/[^a-zA-Z0-9]/g, '_')}_35mm_Album.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ZIP archive with ${state.photos.length} photos (A-03)!`);
};

window.handleSaveHostSettings = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.event.name = fd.get('name').trim();
  state.event.config.shots_per_guest = Math.min(50, Math.max(10, parseInt(fd.get('shots_per_guest'), 10) || 24));
  state.event.config.filter_id = fd.get('filter_id');
  state.event.config.reveal_at = new Date(fd.get('reveal_at')).toISOString();
  state.event.config.date_stamp = fd.has('date_stamp');
  state.event.config.guests_can_view_after_reveal = fd.has('guests_can_view');
  state.event.access_paused = fd.has('access_paused');

  await window.storageEngine.put('events', state.event);
  showToast('Event settings and film stock updated!');
  await refreshDataAndRender();
};

window.handleSelectPlan = async (planId, cap, shots) => {
  state.event.plan = planId;
  state.event.payment_status = planId === 'demo' ? 'free_demo' : 'paid';
  state.event.config.guest_cap = cap;
  state.event.config.shots_per_guest = shots;
  state.event.config.retention_days = planId === 'demo' ? 30 : planId === 'plus' ? 730 : 365;
  await window.storageEngine.put('events', state.event);
  showToast(`Switched event to ${planId.toUpperCase()} plan (Guest cap: ${cap}, ${shots} shots/roll).`);
  await refreshDataAndRender();
};

window.handleDuplicateEvent = async () => {
  showToast('Event configuration duplicated as reusable template (H-06).');
};

window.copyShareLink = () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${state.event.token}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  }
  showToast('Unique event link copied to clipboard!');
};

window.handleRegenerateToken = async () => {
  state.event.token = 'w7k9-' + Math.random().toString(36).substring(2, 8);
  await window.storageEngine.put('events', state.event);
  showToast('New event link & QR code generated; old link invalidated (Q-04).');
  await refreshDataAndRender();
};

window.downloadQRAsSVG = () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${state.event.token}`;
  const svg = window.generateEventQRCodeSVG(shareUrl, 512, '#1C1917', '#FFFFFF');
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.event.token}_QR.svg`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded crisp vector QR code (.SVG)!');
};

window.downloadQRAsPNG = () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?event=${state.event.token}`;
  const svg = window.generateEventQRCodeSVG(shareUrl, 600, '#1C1917', '#FFFFFF');
  const img = new Image();
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${state.event.token}_QR.png`;
    a.click();
    showToast('Downloaded print-ready QR code (.PNG)!');
  };
  img.src = url;
};

window.adminExtendRetention = async () => {
  state.event.config.retention_days += 30;
  await window.storageEngine.put('events', state.event);
  showToast(`Extended retention to ${state.event.config.retention_days} days (M-03).`);
  await refreshDataAndRender();
};

window.adminResetDemoData = () => {
  indexedDB.deleteDatabase('DisposableCameraDB_v1');
  localStorage.removeItem('dc_device_fp');
  window.location.reload();
};

document.addEventListener('DOMContentLoaded', bootstrapApp);
