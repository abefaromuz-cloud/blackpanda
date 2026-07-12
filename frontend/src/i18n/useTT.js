import { useLang } from './LangContext';
import { zhDict } from './zhDict';

// tt('Русский текст') — если язык интерфейса zh и перевод в словаре есть, отдаёт его,
// иначе возвращает исходный текст как запасной вариант (чтобы ничего не падало и не пустело).
export function useTT() {
  const { lang } = useLang();
  return function tt(text) {
    if (lang !== 'zh') return text;
    return zhDict[text] || text;
  };
}
