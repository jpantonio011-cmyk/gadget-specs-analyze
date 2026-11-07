(function () {
  'use strict';

  // ==================== DOM REFS ====================
  const themeToggle = document.getElementById('themeToggle');
  const cameraArea = document.getElementById('cameraArea');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const cameraStatusText = document.getElementById('cameraStatusText');
  const video = document.getElementById('video');
  const capturedPreview = document.getElementById('capturedPreview');
  const captureCanvas = document.getElementById('captureCanvas');
  const captureBtn = document.getElementById('captureBtn');
  const retakeBtn = document.getElementById('retakeBtn');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const statusMessage = document.getElementById('statusMessage');
  const resultContent = document.getElementById('resultContent');
  const finalActions = document.getElementById('finalActions');
  const captureAgainBtn = document.getElementById('captureAgainBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  // ==================== STATE ====================
  let stream = null;
  let capturedBlob = null;
  let abortController = null;
  let isRequesting = false;
  let isCameraActive = false;
  let hasAnalyzed = false;

  // ==================== THEME ====================
  const THEME_KEY = 'gadget-analyzer-theme';

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      themeToggle.textContent = '☀️';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeToggle.textContent = '🌙';
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  const savedTheme = localStorage.getItem(THEME_KEY);
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');

  themeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    applyTheme(isLight ? 'dark' : 'light');
  });

  // ==================== HELPERS ====================
  function setStatus(msg, isError = false) {
    statusMessage.textContent = msg;
    statusMessage.style.color = isError ? 'var(--error-text)' : 'var(--status-text)';
  }

  function setResult(text, isError = false) {
    resultContent.textContent = text;
    resultContent.style.color = isError ? 'var(--error-text)' : 'var(--result-text)';
  }

  function showFinalActions(show) {
    finalActions.classList.toggle('visible', show);
    if (show) {
      analyzeBtn.disabled = true;
      cancelBtn.disabled = true;
    }
  }

  // ==================== CAMERA ====================
  async function startCamera() {
    stopCamera();
    cameraPlaceholder.classList.remove('hidden');
    video.classList.add('hidden');
    capturedPreview.classList.add('hidden');
    captureBtn.disabled = true;
    retakeBtn.style.display = 'none';
    captureBtn.style.display = 'inline-flex';
    cameraStatusText.textContent = 'Starting camera…';
    cameraPlaceholder.querySelector('.placeholder-icon').style.display = 'block';
    finalActions.classList.remove('visible');
    analyzeBtn.disabled = true;
    hasAnalyzed = false;
    capturedBlob = null;
    cameraArea.classList.remove('active');

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      stream = mediaStream;
      video.srcObject = mediaStream;
      video.classList.remove('hidden');
      cameraPlaceholder.classList.add('hidden');
      isCameraActive = true;

      await video.play();
      captureBtn.disabled = false;
      setStatus('Camera ready. Point at a gadget and capture.');
      cameraStatusText.textContent = 'Camera ready';
    } catch (err) {
      console.error('Camera error:', err);
      isCameraActive = false;
      let msg = 'Could not access camera. ';
      if (err.name === 'NotAllowedError') msg += 'Please allow camera permission.';
      else if (err.name === 'NotFoundError') msg += 'No camera found.';
      else if (err.name === 'NotReadableError') msg += 'Camera is busy.';
      else msg += 'Try again or use a different device.';
      cameraStatusText.textContent = msg;
      cameraPlaceholder.querySelector('.placeholder-icon').style.display = 'block';
      setStatus(msg, true);
      captureBtn.disabled = true;
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    isCameraActive = false;
    video.srcObject = null;
    video.classList.add('hidden');
  }

  // ==================== CAPTURE ====================
  async function capturePhoto() {
    if (!stream || !isCameraActive) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) {
      setStatus('Camera not ready yet. Try again.', true);
      return;
    }

    const MAX_SIDE = 1280;
    let targetWidth = width;
    let targetHeight = height;
    if (width > MAX_SIDE || height > MAX_SIDE) {
      const ratio = Math.min(MAX_SIDE / width, MAX_SIDE / height);
      targetWidth = Math.round(width * ratio);
      targetHeight = Math.round(height * ratio);
    }

    captureCanvas.width = targetWidth;
    captureCanvas.height = targetHeight;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);

    try {
      const blob = await new Promise((resolve, reject) => {
        captureCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
          'image/jpeg',
          0.85
        );
      });
      capturedBlob = blob;

      const url = URL.createObjectURL(blob);
      capturedPreview.src = url;
      capturedPreview.classList.remove('hidden');
      video.classList.add('hidden');
      cameraPlaceholder.classList.add('hidden');

      captureBtn.style.display = 'none';
      retakeBtn.style.display = 'inline-flex';
      analyzeBtn.disabled = false;
      setStatus('Photo captured. Tap Analyze.');
      cameraArea.classList.add('active');

      stopCamera();
    } catch (err) {
      setStatus('Could not capture photo. Try again.', true);
    }
  }

  // ==================== RETAKE ====================
  function retakePhoto() {
    capturedBlob = null;
    capturedPreview.src = '';
    capturedPreview.classList.add('hidden');
    analyzeBtn.disabled = true;
    hasAnalyzed = false;
    finalActions.classList.remove('visible');
    cameraArea.classList.remove('active');
    startCamera();
  }

  // ==================== PROMPT ====================
  function buildPrompt() {
    return `You are a gadget specs analyzer. Examine the uploaded gadget image and return a JSON object with these exact fields:
{
  "description": "a detailed description of the gadget (at least 15 words, include color, shape, visible features)",
  "specs": "key technical specs you can infer (e.g. screen size, camera, battery, processor, RAM, storage)",
  "brand": "the brand of the gadget",
  "estimated_cost": "estimated price in Philippine pesos (₱)",
  "good_at": "what this gadget is particularly good at (e.g. 'this phone is great for gaming')"
}
Reply with ONLY a valid JSON object, no markdown, no code fences.`;
  }

  // ==================== EXTRACT JSON ====================
  function extractJson(text) {
    const t = String(text).replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const s = t.indexOf('{');
    const e = t.lastIndexOf('}');
    if (s < 0 || e <= s) return null;
    try {
      return JSON.parse(t.slice(s, e + 1));
    } catch {
      return null;
    }
  }

  // ==================== ANALYZE ====================
  async function analyzeGadget() {
    if (!capturedBlob) {
      setStatus('Please capture a photo first.', true);
      return;
    }
    if (isRequesting) return;
    if (abortController) abortController.abort();

    abortController = new AbortController();
    const signal = abortController.signal;
    const timeoutId = setTimeout(() => {
      if (abortController) abortController.abort();
    }, 75000);

    isRequesting = true;
    analyzeBtn.disabled = true;
    cancelBtn.disabled = false;
    setStatus('Analyzing gadget… (may take 5–30s)');
    setResult('Analyzing… please wait.', false);

    const formData = new FormData();
    formData.append('message', buildPrompt());
    formData.append('image', capturedBlob, 'gadget.jpg');

    try {
      const response = await fetch('https://oxford.uk.eu.org/ai/oxford', {
        method: 'POST',
        body: formData,
        signal: signal
      });

      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        let errMsg = data.error || `Request failed (${response.status})`;
        if (response.status === 403) errMsg = 'Available only in the Philippines.';
        else if (response.status === 429) {
          const retry = response.headers.get('Retry-After');
          errMsg = `Too many requests. ${retry ? `Wait ${retry}s.` : 'Wait a minute.'}`;
        } else if (response.status === 413) errMsg = 'Image too large.';
        else if (response.status === 502 || response.status === 503) {
          errMsg = 'Service temporarily unavailable. Try again shortly.';
        }
        setStatus(errMsg, true);
        setResult(errMsg, true);
        showFinalActions(false);
        return;
      }

      const reply = data.reply || '';
      const parsed = extractJson(reply);

      if (parsed && typeof parsed === 'object') {
        const desc = typeof parsed.description === 'string' ? parsed.description : '—';
        const specs = typeof parsed.specs === 'string' ? parsed.specs : '—';
        const brand = typeof parsed.brand === 'string' ? parsed.brand : '—';
        const cost = typeof parsed.estimated_cost === 'string' ? parsed.estimated_cost : '—';
        const goodAt = typeof parsed.good_at === 'string' ? parsed.good_at : '—';

        const output =
          `📝 Description: ${desc}\n\n` +
          `⚙️ Specs: ${specs}\n\n` +
          `🏷️ Brand: ${brand}\n\n` +
          `💰 Estimated Cost: ${cost}\n\n` +
          `✅ Good At: ${goodAt}`;
        setResult(output, false);
        setStatus('Analysis complete.');
        hasAnalyzed = true;
        showFinalActions(true);
      } else {
        setResult(reply || 'No analysis returned.', false);
        setStatus('Analysis complete (raw).');
        hasAnalyzed = true;
        showFinalActions(true);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        setStatus('Request cancelled or timed out.', true);
        setResult('Request was cancelled. Try again.', true);
      } else {
        console.error(err);
        setStatus('Network error. Check your connection.', true);
        setResult('Could not reach Oxford AI. Please try again.', true);
      }
      showFinalActions(false);
    } finally {
      isRequesting = false;
      analyzeBtn.disabled = !capturedBlob || hasAnalyzed;
      cancelBtn.disabled = true;
      if (abortController && abortController.signal === signal) {
        abortController = null;
      }
      if (hasAnalyzed) {
        analyzeBtn.disabled = true;
      }
    }
  }

  // ==================== CANCEL ====================
  function cancelRequest() {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    setStatus('Request cancelled.');
    isRequesting = false;
    cancelBtn.disabled = true;
    if (capturedBlob && !hasAnalyzed) analyzeBtn.disabled = false;
  }

  // ==================== EVENT LISTENERS ====================
  captureBtn.addEventListener('click', capturePhoto);
  retakeBtn.addEventListener('click', retakePhoto);
  analyzeBtn.addEventListener('click', analyzeGadget);
  cancelBtn.addEventListener('click', cancelRequest);

  captureAgainBtn.addEventListener('click', () => {
    hasAnalyzed = false;
    retakePhoto();
  });

  leaveBtn.addEventListener('click', () => {
    stopCamera();
    capturedBlob = null;
    capturedPreview.src = '';
    capturedPreview.classList.add('hidden');
    finalActions.classList.remove('visible');
    cameraArea.classList.remove('active');
    analyzeBtn.disabled = true;
    hasAnalyzed = false;
    setResult('Your gadget analysis will appear here.', false);
    setStatus('Session ended. Restarting camera…');
    setTimeout(() => startCamera(), 100);
  });

  // ==================== INITIALIZE ====================
  window.addEventListener('load', () => {
    setTimeout(() => startCamera(), 150);
  });

  window.addEventListener('beforeunload', () => {
    stopCamera();
    if (abortController) abortController.abort();
  });

  window.addEventListener('pagehide', () => {
    stopCamera();
    if (abortController) abortController.abort();
  });
})();