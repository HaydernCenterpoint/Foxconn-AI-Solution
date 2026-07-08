import { useTranslation } from 'react-i18next';

const dictionary: Record<string, Record<string, string>> = {
  'Lắp ráp': {
    vi: 'Lắp ráp',
    en: 'Assembly',
    'zh-CN': '装配',
    zh: '装配'
  },
  'Lap rap': {
    vi: 'Lắp ráp',
    en: 'Assembly',
    'zh-CN': '装配',
    zh: '装配'
  },
  'Xem danh sách và sơ đồ luồng thiết bị của các dây chuyền sản xuất': {
    vi: 'Xem danh sách và sơ đồ luồng thiết bị của các dây chuyền sản xuất',
    en: 'View list and flow diagrams of production lines',
    'zh-CN': '查看生产线列表及设备流程图',
    zh: '查看生产线列表及设备流程图'
  },
  'DÂY CHUYỀN B': {
    vi: 'Dây chuyền B',
    en: 'Production Line B',
    'zh-CN': '生产B线',
    zh: '生产B线'
  },
  'Giám sát tiến trình sản xuất và liên kết PLC tự động.': {
    vi: 'Giám sát tiến trình sản xuất và liên kết PLC tự động.',
    en: 'Monitor production progress and automated PLC connections.',
    'zh-CN': '监控生产进度和自动 PLC 连接。',
    zh: '监控生产进度和自动 PLC 连接。'
  }
};

/**
 * Translates dynamic strings by matching phrases in the dictionary.
 */
export function translateDynamicText(text: string, currentLang: string): string {
  if (!text) return text;
  const normalizedText = text.trim();
  const match = dictionary[normalizedText];
  if (match) {
    return match[currentLang] || match['en'] || text;
  }
  return text;
}

/**
 * React Hook for easily translating dynamic machine & line names / descriptions.
 */
export function useDynamicTranslation() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language || 'vi';
  
  return {
    tDynamic: (text: string) => translateDynamicText(text, currentLang),
    currentLang
  };
}
