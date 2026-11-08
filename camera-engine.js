/**
 * Disposable Camera Hardware & Film Processing Engine (PRD Sections 6.3, 6.4, 6.5)
 * - WebRTC live camera stream + front/rear switch + hardware torch toggle
 * - Interactive fallback wedding scene canvas generator (for instant desktop/demo testing)
 * - 1600px long-edge downscaler & JPEG compressor (U-02)
 * - 3 Authentic Film Stocks: Warm Gold 200, Ilford HP5 B&W, Fuji Faded Vintage (F-01)
 * - Procedural film grain, optical vignette, subtle light leak & quartz date stamp (F-03)
 * - Web Audio API mechanical shutter & film wind wheel sound synthesizer (C-09)
 */

const FILM_LOOKS = {
  warm_gold: {
    id: 'warm_gold',
    name: 'Gold 200 Warm',
    badge: '35mm COLOR · ISO 200',
    description: 'Golden-hour warmth, rich skin tones, subtle amber light leak & fine grain.',
    cssPreviewFilter: 'sepia(0.18) saturate(1.25) contrast(1.06) brightness(1.03)'
  },
  bw_ilford: {
    id: 'bw_ilford',
    name: 'Ilford 400 B&W',
    badge: '35mm MONO · ISO 400',
    description: 'Classic silver-halide black & white with deep contrast and documentary grain.',
    cssPreviewFilter: 'grayscale(1) contrast(1.22) brightness(1.02)'
  },
  vintage_fuji: {
    id: 'vintage_fuji',
    name: 'Superia Faded ’98',
    badge: '35mm NOSTALGIC · ISO 400',
    description: 'Soft matte blacks, pastel highlights, nostalgic emerald-amber film cast.',
    cssPreviewFilter: 'sepia(0.12) contrast(0.94) brightness(1.05) saturate(0.88) hue-rotate(-6deg)'
  }
};

class DisposableCameraEngine {
  constructor() {
    this.stream = null;
    this.facingMode = 'environment'; // 'environment' | 'user'
    this.flashEnabled = false;
    this.muted = false;
    this.audioCtx = null;
    this.simulatedSceneIndex = 0;
  }

  /**
   * C-07: Detect in-app browsers (WhatsApp, Instagram, Facebook, Messenger, TikTok)
   */
  detectInAppBrowser() {
    const ua = navigator.userAgent || navigator.vendor || window.opera || '';
    const rules = [
      { name: 'Instagram', regex: /Instagram/i },
      { name: 'WhatsApp', regex: /WhatsApp/i },
      { name: 'Facebook', regex: /FBAN|FBAV|FB_IAB/i },
      { name: 'Messenger', regex: /Messenger/i },
      { name: 'TikTok', regex: /BytedanceWebview|TikTok/i }
    ];
    for (const rule of rules) {
      if (rule.regex.test(ua)) {
        return { isInApp: true, appName: rule.name };
      }
    }
    return { isInApp: false, appName: null };
  }

  /**
   * Start live camera stream (C-03, C-04)
   */
  async startCamera(videoElement) {
    this.stopCamera();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { ok: false, reason: 'unsupported' };
    }

    try {
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1440 }
        }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoElement) {
        videoElement.srcObject = this.stream;
        await videoElement.play();
      }
      return { ok: true, stream: this.stream };
    } catch (err) {
      return {
        ok: false,
        reason: err.name === 'NotAllowedError' ? 'denied' : 'unavailable',
        error: err
      };
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  async flipCamera(videoElement) {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    return await this.startCamera(videoElement);
  }

  /**
   * C-10: Hardware Torch / Flash Toggle (plus screen flash fallback for front camera / iOS)
   */
  async toggleFlash() {
    this.flashEnabled = !this.flashEnabled;
    if (this.stream) {
      const track = this.stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const caps = track.getCapabilities();
        if (caps.torch) {
          try {
            await track.applyConstraints({ advanced: [{ torch: this.flashEnabled }] });
          } catch (e) {
            // Fallback to screen flash on capture
          }
        }
      }
    }
    return this.flashEnabled;
  }

  /**
   * C-09: Synthesize authentic mechanical disposable camera shutter click + plastic wheel wind
   */
  playShutterAndWindSound() {
    if (this.muted) return;

    if (navigator.vibrate) {
      try {
        navigator.vibrate([25, 40, 15]);
      } catch (e) {}
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;

      // 1. Crisp mechanical leaf-shutter snap (0.00s - 0.045s)
      const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1850, now);
      filter.Q.setValueAtTime(2.2, now);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.75, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.055);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start(now);

      // 2. Plastic thumb-wheel ratchet clicks (0.16s - 0.52s)
      const ratchetTicks = [0.16, 0.21, 0.26, 0.31, 0.37, 0.43, 0.50];
      ratchetTicks.forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const rGain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1100 + idx * 45, now + offset);
        osc.frequency.exponentialRampToValueAtTime(320, now + offset + 0.022);

        rGain.gain.setValueAtTime(0.18, now + offset);
        rGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.025);

        osc.connect(rGain);
        rGain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.026);
      });
    } catch (e) {
      // Audio playback optional if blocked
    }
  }

  /**
   * Capture Frame from Live Video OR Simulated Wedding Scene, Resize to <=1600px (U-02),
   * and Apply Authentic Film Look + Grain + Vignette + Date Stamp (F-01, F-03, P-02)
   */
  async captureAndDevelopFrame({
    videoElement,
    filterId = 'warm_gold',
    dateStamp = true,
    isDemoWatermark = false,
    guestName = 'Guest',
    frameNumber = 1
  }) {
    this.playShutterAndWindSound();

    const maxEdge = 1600; // PRD U-02: maximum 1,600 pixels on long edge
    let srcWidth = 1200;
    let srcHeight = 1600;
    let hasLiveVideo =
      videoElement &&
      this.stream &&
      videoElement.readyState >= 2 &&
      videoElement.videoWidth > 0;

    if (hasLiveVideo) {
      srcWidth = videoElement.videoWidth;
      srcHeight = videoElement.videoHeight;
    }

    const scale = Math.min(1, maxEdge / Math.max(srcWidth, srcHeight));
    const width = Math.round(srcWidth * scale);
    const height = Math.round(srcHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (hasLiveVideo) {
      if (this.facingMode === 'user') {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoElement, 0, 0, width, height);
        ctx.restore();
      } else {
        ctx.drawImage(videoElement, 0, 0, width, height);
      }
    } else {
      // Draw a richly detailed simulated wedding moment when testing on desktop without webcam
      this.drawSimulatedWeddingMoment(ctx, width, height, frameNumber, guestName);
    }

    // Apply pixel-level Film Look LUT / Color Grading (F-01)
    this.applyFilmStockGrading(ctx, width, height, filterId);

    // Apply optical lens vignette & subtle disposable-camera light leak (F-01)
    this.applyVignetteAndLightLeak(ctx, width, height, filterId, frameNumber);

    // Apply 35mm organic film grain
    this.applyFilmGrain(ctx, width, height, filterId === 'bw_ilford' ? 24 : 16);

    // F-03: Optional Quartz Date Stamp in bottom-right corner ('26 11 08)
    if (dateStamp) {
      this.applyQuartzDateStamp(ctx, width, height);
    }

    // P-02: Free Demo Event Watermark
    if (isDemoWatermark) {
      this.applyDemoWatermark(ctx, width, height);
    }

    // U-02: Export compressed JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
    const sizeBytes = Math.round((dataUrl.length * 3) / 4);

    return {
      dataUrl,
      sizeBytes,
      width,
      height
    };
  }

  /**
   * Renders a charming candlelit/garden wedding illustration when testing without a physical camera
   */
  drawSimulatedWeddingMoment(ctx, w, h, frameNumber, guestName) {
    const scenes = [
      { title: 'First Dance Under String Lights', sky1: '#1b192e', sky2: '#432d42', accent: '#f6c98e' },
      { title: 'Champagne Tower Toast', sky1: '#231f20', sky2: '#543d34', accent: '#f9df99' },
      { title: 'Cutting the Three-Tier Cake', sky1: '#2b2430', sky2: '#5d4754', accent: '#ffd6a5' },
      { title: 'Sparkler Send-Off in the Courtyard', sky1: '#141824', sky2: '#2e3148', accent: '#ffcf70' }
    ];
    const scene = scenes[(frameNumber + this.simulatedSceneIndex++) % scenes.length];

    // Warm evening backdrop gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, scene.sky1);
    bgGrad.addColorStop(0.65, scene.sky2);
    bgGrad.addColorStop(1, '#1a1414');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Bokeh fairy lights across the reception ceiling
    for (let i = 0; i < 42; i++) {
      const bx = ((Math.sin(i * 73.1 + frameNumber) * 0.5 + 0.5) * w);
      const by = ((Math.cos(i * 29.7 + frameNumber) * 0.5 + 0.5) * h * 0.55);
      const radius = (12 + (i % 5) * 10) * (w / 1000);
      const bGrad = ctx.createRadialGradient(bx, by, 1, bx, by, radius);
      bGrad.addColorStop(0, 'rgba(255, 244, 214, 0.88)');
      bGrad.addColorStop(0.4, 'rgba(255, 210, 142, 0.38)');
      bGrad.addColorStop(1, 'rgba(255, 210, 142, 0)');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(bx, by, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center disposable-flash spotlight effect (like an on-camera xenon flash in a dim reception)
    const flashGrad = ctx.createRadialGradient(w * 0.5, h * 0.52, w * 0.05, w * 0.5, h * 0.52, w * 0.65);
    flashGrad.addColorStop(0, 'rgba(255, 248, 238, 0.25)');
    flashGrad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = flashGrad;
    ctx.fillRect(0, 0, w, h);

    // Silhouettes of celebrating couple & guests
    ctx.fillStyle = '#f7f1e8';
    // Bride silhouette
    ctx.beginPath();
    ctx.arc(w * 0.45, h * 0.48, w * 0.048, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.36, h * 0.85);
    ctx.quadraticCurveTo(w * 0.45, h * 0.52, w * 0.54, h * 0.85);
    ctx.closePath();
    ctx.fill();

    // Groom silhouette
    ctx.fillStyle = '#25232a';
    ctx.beginPath();
    ctx.arc(w * 0.56, h * 0.45, w * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(w * 0.50, h * 0.51, w * 0.12, h * 0.34);

    // Subtle scene caption for simulated test shots
    ctx.save();
    ctx.fillStyle = 'rgba(255, 250, 240, 0.78)';
    ctx.font = `600 ${Math.round(w * 0.025)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${scene.title} · Shot by ${guestName}`, w * 0.5, h * 0.90);
    ctx.restore();
  }

  applyFilmStockGrading(ctx, w, h, filterId) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      if (filterId === 'bw_ilford') {
        // High-contrast Ilford HP5 400 panchromatic curve
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        // S-curve contrast with lifted paper whites
        let norm = lum / 255;
        norm = norm < 0.5 ? 2 * norm * norm : 1 - Math.pow(-2 * norm + 2, 2) / 2;
        const val = Math.min(255, Math.max(10, norm * 248 + 6));
        d[i] = val;
        d[i + 1] = val * 0.99;
        d[i + 2] = val * 0.96; // Warm silver gelatin paper tone
      } else if (filterId === 'vintage_fuji') {
        // Fuji Superia Faded Vintage: lifted matte blacks, cool-green shadows, warm highlights
        r = 22 + r * 0.86;
        g = 26 + g * 0.87;
        b = 28 + b * 0.82;
        if (r + g + b > 420) {
          r = Math.min(255, r * 1.06);
          g = Math.min(255, g * 1.02);
        }
        d[i] = Math.min(255, r);
        d[i + 1] = Math.min(255, g);
        d[i + 2] = Math.min(255, b);
      } else {
        // Default: Kodak Gold 200 Warm
        r = Math.min(255, r * 1.09 + 8);
        g = Math.min(255, g * 1.03 + 4);
        b = Math.max(0, b * 0.91);
        // Subtle S-contrast
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
      }
    }

    ctx.putImageData(imgData, 0, 0);
  }

  applyVignetteAndLightLeak(ctx, w, h, filterId, frameNumber) {
    // 1. Plastic meniscus lens corner vignette
    const rad = Math.max(w, h) * 0.72;
    const vig = ctx.createRadialGradient(w / 2, h / 2, rad * 0.38, w / 2, h / 2, rad);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(12, 8, 6, 0.18)');
    vig.addColorStop(1, 'rgba(8, 5, 4, 0.56)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // 2. Subtle organic film edge light leak on color stocks
    if (filterId !== 'bw_ilford') {
      const leakX = frameNumber % 2 === 0 ? 0 : w;
      const leakGrad = ctx.createRadialGradient(leakX, h * 0.28, 10, leakX, h * 0.28, w * 0.42);
      leakGrad.addColorStop(0, 'rgba(255, 130, 55, 0.22)');
      leakGrad.addColorStop(0.5, 'rgba(255, 90, 40, 0.08)');
      leakGrad.addColorStop(1, 'rgba(255, 90, 40, 0)');
      ctx.fillStyle = leakGrad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  applyFilmGrain(ctx, w, h, strength = 18) {
    // Fast tiled noise pattern scaled across canvas
    const tileSize = 128;
    const noiseCanvas = document.createElement('canvas');
    noiseCanvas.width = tileSize;
    noiseCanvas.height = tileSize;
    const nCtx = noiseCanvas.getContext('2d');
    const nData = nCtx.createImageData(tileSize, tileSize);
    for (let i = 0; i < nData.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * strength * 4;
      nData.data[i] = v;
      nData.data[i + 1] = v;
      nData.data[i + 2] = v;
      nData.data[i + 3] = 26;
    }
    nCtx.putImageData(nData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(noiseCanvas, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * F-03: Classic 1990s Amber Quartz Date Stamp in bottom-right corner
   */
  applyQuartzDateStamp(ctx, w, h) {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const stampText = `'${yy} ${mm} ${dd}`;

    const fontSize = Math.max(18, Math.round(Math.min(w, h) * 0.036));
    ctx.save();
    ctx.font = `700 ${fontSize}px "Courier New", Courier, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';

    const x = w - Math.round(w * 0.055);
    const y = h - Math.round(h * 0.045);

    // Amber LED glow
    ctx.shadowColor = 'rgba(255, 110, 0, 0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#FF9A2E';
    ctx.fillText(stampText, x, y);

    // Bright inner core
    ctx.shadowBlur = 2;
    ctx.fillStyle = '#FFD180';
    ctx.fillText(stampText, x, y);
    ctx.restore();
  }

  /**
   * P-02: Free Demo Watermark
   */
  applyDemoWatermark(ctx, w, h) {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.font = `600 ${Math.max(14, Math.round(w * 0.022))}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText('DEMO ROLL · UNLOCK FULL EVENT TO REMOVE WATERMARK', Math.round(w * 0.04), Math.round(h * 0.05));
    ctx.restore();
  }
}

window.FILM_LOOKS = FILM_LOOKS;
window.cameraEngine = new DisposableCameraEngine();
