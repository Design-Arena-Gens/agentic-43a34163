"use client";
import { useEffect, useRef, useState } from 'react';

function useBinauralWhisper() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = () => (ctxRef.current ??= new (window.AudioContext || (window as any).webkitAudioContext)());

  // Create a whisper-like noise buffer
  const createWhisperBuffer = (ctx: AudioContext, durationSec: number) => {
    const sampleRate = 22050;
    const length = Math.floor(durationSec * sampleRate);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      // White noise with slight pinking
      const w = Math.random() * 2 - 1;
      const pink = (w + (data[i - 1] || 0) * 0.97) * 0.5;
      data[i] = pink;
    }
    return buffer;
  };

  const scheduleEnvelope = (gain: GainNode, t0: number, dur: number) => {
    // Rough syllable-shaped envelope for: "Re-lax your jaw for me"
    const envPoints = [
      0.00, 0.0,
      0.10, 0.8, // Re
      0.25, 0.2,
      0.35, 0.9, // lax
      0.60, 0.15,
      0.70, 0.8, // your
      0.95, 0.25,
      1.10, 0.85, // jaw
      1.40, 0.3,
      1.55, 0.8, // for
      1.80, 0.25,
      1.95, 0.95, // me
      2.30, 0.0,
    ];
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    for (let i = 0; i < envPoints.length; i += 2) {
      const pt = envPoints[i];
      const val = envPoints[i + 1];
      const tt = t0 + Math.min(pt, dur);
      gain.gain.linearRampToValueAtTime(val, tt);
    }
    gain.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  };

  const play = async () => {
    const ctx = getCtx();
    const loopDur = 3.2; // keep under 5s window
    const buf = createWhisperBuffer(ctx, loopDur + 0.1);

    // Left chain
    const leftSrc = ctx.createBufferSource();
    leftSrc.buffer = buf;
    const leftBp = ctx.createBiquadFilter();
    leftBp.type = 'bandpass';
    leftBp.frequency.value = 1800;
    leftBp.Q.value = 0.8;
    const leftHp = ctx.createBiquadFilter();
    leftHp.type = 'highpass';
    leftHp.frequency.value = 400;
    const leftGain = ctx.createGain();
    const leftPan = ctx.createStereoPanner();
    leftPan.pan.value = -0.55;
    leftSrc.connect(leftBp).connect(leftHp).connect(leftGain).connect(leftPan).connect(ctx.destination);

    // Right chain with slight delay for binaural sense
    const rightSrc = ctx.createBufferSource();
    rightSrc.buffer = buf;
    const rightDelay = ctx.createDelay(0.05);
    rightDelay.delayTime.value = 0.02;
    const rightBp = ctx.createBiquadFilter();
    rightBp.type = 'bandpass';
    rightBp.frequency.value = 1700;
    rightBp.Q.value = 0.9;
    const rightHp = ctx.createBiquadFilter();
    rightHp.type = 'highpass';
    rightHp.frequency.value = 380;
    const rightGain = ctx.createGain();
    const rightPan = ctx.createStereoPanner();
    rightPan.pan.value = 0.55;
    rightSrc.connect(rightDelay).connect(rightBp).connect(rightHp).connect(rightGain).connect(rightPan).connect(ctx.destination);

    const t0 = ctx.currentTime + 0.05;
    scheduleEnvelope(leftGain, t0, loopDur);
    scheduleEnvelope(rightGain, t0, loopDur);
    leftSrc.start(t0);
    rightSrc.start(t0);

    const stopAt = t0 + loopDur + 0.02;
    leftSrc.stop(stopAt);
    rightSrc.stop(stopAt);
  };

  const tap = () => {
    const ctx = getCtx();
    const t0 = ctx.currentTime + 0.01;
    // Short high-frequency click using noise burst
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 4000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.9, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    osc.connect(hp).connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.04);
  };

  return { play, tap };
}

export default function Home() {
  const [armed, setArmed] = useState(false);
  const [loopIndex, setLoopIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  const { play, tap } = useBinauralWhisper();

  useEffect(() => {
    const vid = videoRef.current;
    const canvas = canvasRef.current;
    if (!vid || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t0 = performance.now();

    // Synthetic visual: simulate rack focus and wipe transition using gradients, blur, and masks
    const render = () => {
      const t = (performance.now() - t0) / 1000; // seconds
      const loopDur = 5.0; // seconds
      const tt = t % loopDur;

      const w = canvas.width = canvas.clientWidth * devicePixelRatio;
      const h = canvas.height = canvas.clientHeight * devicePixelRatio;

      ctx.clearRect(0, 0, w, h);

      // Background blurred surgical room vibes
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0c0f12');
      grad.addColorStop(1, '#1a2229');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Rack focus simulation: blur changes over time for "probe" and "hand"
      // We'll draw two metallic shapes and animate focus by sharpness (edge contrast)
      const centerX = w * 0.55;
      const centerY = h * 0.48;

      // Determine focus amount between tip (0-2s), hand (2-4s)
      let focusProbe = 1.0;
      let focusHand = 0.2;
      if (tt < 2.0) {
        // Focus on tip
        const k = tt / 2.0;
        focusProbe = 1.0;
        focusHand = 0.2 + 0.2 * Math.cos(k * Math.PI);
      } else if (tt < 4.0) {
        const k = (tt - 2.0) / 2.0;
        focusProbe = 0.3 + 0.3 * Math.cos(k * Math.PI);
        focusHand = 1.0;
      } else {
        // Wipe transition period (4-5s)
        focusProbe = 1.0;
        focusHand = 1.0;
      }

      // Draw probe: a shiny metallic rod with tip highlight
      const drawProbe = (sharpness: number) => {
        const rodLen = Math.min(w, h) * 0.7;
        const rodWidth = Math.min(w, h) * 0.02;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-0.25);

        // Glow/blur amount inversely tied to sharpness
        const blurPx = (1 - sharpness) * 6 * devicePixelRatio;
        (ctx as any).filter = `blur(${blurPx}px)`;

        // Metallic gradient
        const rodGrad = ctx.createLinearGradient(-rodLen * 0.5, 0, rodLen * 0.5, 0);
        rodGrad.addColorStop(0.0, '#9aa3aa');
        rodGrad.addColorStop(0.3, '#f3f6f8');
        rodGrad.addColorStop(0.5, '#8c949b');
        rodGrad.addColorStop(0.7, '#f3f6f8');
        rodGrad.addColorStop(1.0, '#7c858d');
        ctx.fillStyle = rodGrad;
        ctx.fillRect(-rodLen * 0.5, -rodWidth * 0.5, rodLen, rodWidth);

        // Tip highlight
        ctx.fillStyle = '#e7eef5';
        ctx.beginPath();
        ctx.arc(rodLen * 0.5, 0, rodWidth * 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
        (ctx as any).filter = 'none';
      };

      // Draw glove/hand abstract shape near camera edge
      const drawHand = (sharpness: number) => {
        ctx.save();
        const blurPx = (1 - sharpness) * 7 * devicePixelRatio;
        (ctx as any).filter = `blur(${blurPx}px)`;

        ctx.translate(w * 0.2, h * 0.6);
        ctx.rotate(0.2);
        ctx.fillStyle = '#7fb3c7';

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(60, -40, 120, -20);
        ctx.quadraticCurveTo(180, 0, 220, -10);
        ctx.quadraticCurveTo(260, -20, 300, -5);
        ctx.quadraticCurveTo(250, 60, 40, 80);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
        (ctx as any).filter = 'none';
      };

      drawProbe(focusProbe);
      drawHand(focusHand);

      // Wipe transition from hand touch back to probe close-up (soft mask)
      if (tt >= 4.0) {
        const k = (tt - 4.0) / 1.0; // 0..1 over final second
        const maskX = w * (1 - k);
        const grd = ctx.createLinearGradient(maskX - 80, 0, maskX + 80, 0);
        grd.addColorStop(0, 'rgba(10,10,10,1)');
        grd.addColorStop(0.5, 'rgba(10,10,10,0.3)');
        grd.addColorStop(1, 'rgba(10,10,10,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    setReady(true);
    return () => cancelAnimationFrame(raf);
  }, []);

  const start = async () => {
    if (armed) return;
    setArmed(true);

    const run = async () => {
      setLoopIndex((i) => i + 1);

      await play();
      tap();

      // Schedule next loop after ~5s
      setTimeout(run, 5000);
    };

    run();
  };

  return (
    <main className="screen" aria-label="ASMR dental check-in loop">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} aria-hidden />

      <button
        onClick={start}
        disabled={!ready || armed}
        aria-label="Start ASMR loop"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          background: 'transparent', border: 'none', cursor: armed ? 'default' : 'pointer'
        }}
      />

      <div className="caption" role="note" aria-live="polite">Gentle check-in (5s)</div>

      <span className="sr-only" aria-live="assertive">Relax your jaw for me.</span>

      
    </main>
  );
}
