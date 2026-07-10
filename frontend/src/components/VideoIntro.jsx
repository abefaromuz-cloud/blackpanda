import { useRef, useState } from 'react';

export default function VideoIntro({ onDone }) {
  const videoRef = useRef(null);
  const [fading, setFading] = useState(false);

  function finish() {
    setFading(true);
    setTimeout(onDone, 300); // небольшое затухание перед показом системы
  }

  return (
    <div className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      <video
        ref={videoRef}
        src="/preview.mp4"
        autoPlay
        muted
        playsInline
        onEnded={finish}
        onError={finish}
        className="w-full h-full object-contain"
      />
      <button
        onClick={finish}
        className="absolute bottom-6 right-6 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm backdrop-blur border border-white/20 transition"
      >
        Пропустить →
      </button>
    </div>
  );
}
