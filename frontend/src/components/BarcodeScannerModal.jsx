import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { useTT } from '../i18n/useTT';

// Модалка с камерой для сканирования серийника/штрихкода. onResult(text) вызывается один раз при успехе.
export default function BarcodeScannerModal({ onResult, onClose }) {
  const tt = useTT();
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      videoRef.current,
      (result) => {
        if (result) {
          onResult(result.getText());
        }
      }
    ).catch((e) => setError(e?.message || tt('Не удалось открыть камеру')));

    return () => { try { reader.reset(); } catch (e) {} };
  }, [onResult]);

  function submitManual(e) {
    e.preventDefault();
    if (manual.trim()) onResult(manual.trim());
  }

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-bg2 border border-border rounded-2xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <div className="font-bold text-sm">📷 {tt("Сканировать")}</div>
          <button className="btn btn-secondary btn-xs" onClick={onClose}>✕</button>
        </div>
        <div className="p-4">
          <video ref={videoRef} className="w-full rounded-lg bg-black" playsInline />
          {error && <div className="text-red text-xs mt-2">{error}</div>}
          <div className="text-xs text-text3 mt-3 mb-2">{tt("Если камера не распознаёт — введите вручную:")}</div>
          <form onSubmit={submitManual} className="flex gap-2">
            <input className="inp" autoFocus value={manual} onChange={e => setManual(e.target.value)} placeholder={tt("Серийный номер")} />
            <button className="btn btn-primary">OK</button>
          </form>
        </div>
      </div>
    </div>
  );
}
