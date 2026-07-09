// Короткий звуковой сигнал без внешних файлов — как при сканировании штрихкода на кассе.
export function beep(ok = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(0.3, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.3));
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + (ok ? 0.15 : 0.3));
  } catch (e) { /* браузер может блокировать звук до первого взаимодействия — не критично */ }
}
