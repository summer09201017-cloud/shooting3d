function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class AudioManager {
  constructor() {
    this.context = null;
    this.masterGain = null;
    this.enabled = true;
    this.lastAnnouncementAt = 0;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.masterGain) {
      this.masterGain.gain.value = enabled ? 0.18 : 0;
    }
  }

  ensureContext() {
    if (this.context) {
      return this.context;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    this.context = new AudioContextCtor();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = this.enabled ? 0.18 : 0;
    this.masterGain.connect(this.context.destination);
    return this.context;
  }

  unlock() {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      context.resume().catch(() => {});
    }
  }

  vibrate(pattern) {
    if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }

  tone({
    frequency = 440,
    frequencyEnd = null,
    duration = 0.12,
    type = "sine",
    gain = 0.12,
    when = 0,
  }) {
    const context = this.ensureContext();
    if (!context || !this.enabled) {
      return;
    }

    const startTime = context.currentTime + when;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, startTime);
    if (frequencyEnd !== null) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(40, frequencyEnd),
        startTime + duration,
      );
    }

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(
      clamp(gain, 0.0001, 0.4),
      startTime + 0.02,
    );
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration + 0.02);
  }

  uiTap() {
    this.tone({
      frequency: 520,
      frequencyEnd: 760,
      duration: 0.08,
      type: "triangle",
      gain: 0.06,
    });
  }

  whistle() {
    this.tone({
      frequency: 1280,
      frequencyEnd: 980,
      duration: 0.2,
      type: "square",
      gain: 0.11,
    });
    this.tone({
      frequency: 980,
      frequencyEnd: 1180,
      duration: 0.16,
      type: "square",
      gain: 0.06,
      when: 0.04,
    });
  }

  swish() {
    this.tone({
      frequency: 620,
      frequencyEnd: 340,
      duration: 0.12,
      type: "triangle",
      gain: 0.08,
    });
  }

  scoreSting() {
    this.tone({
      frequency: 480,
      frequencyEnd: 720,
      duration: 0.12,
      type: "triangle",
      gain: 0.08,
    });
    this.tone({
      frequency: 720,
      frequencyEnd: 980,
      duration: 0.14,
      type: "triangle",
      gain: 0.08,
      when: 0.08,
    });
  }

  thud(strength = 0.5) {
    this.tone({
      frequency: 120,
      frequencyEnd: 65,
      duration: 0.08,
      type: "sawtooth",
      gain: clamp(0.04 + strength * 0.06, 0.04, 0.12),
    });
  }

  steal() {
    this.tone({
      frequency: 300,
      frequencyEnd: 520,
      duration: 0.09,
      type: "square",
      gain: 0.07,
    });
    this.tone({
      frequency: 680,
      frequencyEnd: 520,
      duration: 0.08,
      type: "square",
      gain: 0.05,
      when: 0.05,
    });
  }

  rebound() {
    this.tone({
      frequency: 240,
      frequencyEnd: 180,
      duration: 0.08,
      type: "triangle",
      gain: 0.05,
    });
  }

  buzzer() {
    this.tone({
      frequency: 230,
      frequencyEnd: 180,
      duration: 0.26,
      type: "square",
      gain: 0.1,
    });
    this.tone({
      frequency: 180,
      frequencyEnd: 210,
      duration: 0.2,
      type: "square",
      gain: 0.08,
      when: 0.12,
    });
  }

  horn() {
    this.tone({
      frequency: 190,
      frequencyEnd: 150,
      duration: 0.42,
      type: "sawtooth",
      gain: 0.12,
    });
    this.tone({
      frequency: 290,
      frequencyEnd: 240,
      duration: 0.42,
      type: "square",
      gain: 0.08,
      when: 0.02,
    });
  }

}
