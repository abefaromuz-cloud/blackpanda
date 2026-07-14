import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function PublicLaptop() {
  const { id } = useParams();
  const [l, setL] = useState(null);
  const [error, setError] = useState('');
  const [activeImg, setActiveImg] = useState(0);

  useEffect(() => {
    api.get(`/public/laptops/${id}`)
      .then(r => setL(r.data))
      .catch(err => setError(err.response?.data?.error || 'Не удалось загрузить карточку'));
  }, [id]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#f6f0ee', fontFamily: 'Inter, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🐼</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }
  if (!l) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#a1a1aa' }}>Загрузка...</div>;
  }

  const images = (l.images && l.images.length ? l.images : [l.image_url]).filter(Boolean);
  const priceRub = Math.round(Number(l.price_sell_cny) * Number(l.rate));
  const specs = [
    ['CPU', l.cpu], ['RAM', l.ram], ['Накопитель', l.storage], ['GPU', l.gpu],
    ['Экран', l.screen], ['Цвет', l.color], ['Сенсор', l.touch === 'yes' ? 'Да' : 'Нет'],
    ['Частота экрана', l.refresh_rate], ['Тип экрана', l.screen_type],
    ['Подсветка клавиатуры', l.keyboard_backlight], ['Раскладка клавиатуры', l.keyboard_layout],
  ].filter(([, v]) => v);

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#f6f0ee', fontFamily: 'Inter, sans-serif', padding: '24px 16px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <img src="/panda-logo-icon.png" alt="" style={{ height: 28 }} />
          <span style={{ fontWeight: 900, fontSize: 18 }}>BlackPanda</span>
        </div>

        {images.length > 0 && (
          <div style={{ aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden', background: '#18181b', marginBottom: 12 }}>
            <img src={images[activeImg]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}
        {images.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {images.map((u, i) => (
              <button key={i} onClick={() => setActiveImg(i)} style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', border: activeImg === i ? '2px solid #e11d2e' : '2px solid transparent', padding: 0, background: 'none', cursor: 'pointer' }}>
                <img src={u} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </button>
            ))}
          </div>
        )}

        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 2 }}>{l.brand} {l.series}</h1>
        <div style={{ fontSize: 13, color: l.in_stock > 0 ? '#22c55e' : '#a1a1aa', marginBottom: 16 }}>
          {l.in_stock > 0 ? `✅ В наличии — ${l.in_stock} шт.` : '⏳ Уточняем наличие'}
        </div>

        <div style={{ background: '#18181b', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          {specs.map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #27272a', fontSize: 14 }}>
              <span style={{ color: '#a1a1aa' }}>{label}</span>
              <span style={{ fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#18181b', borderRadius: 16, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#e8b84b' }}>{priceRub.toLocaleString('ru-RU')} ₽</div>
          <div style={{ fontSize: 12, color: '#71717a', marginTop: 4 }}>Свяжитесь с нами для оформления покупки</div>
        </div>
      </div>
    </div>
  );
}
