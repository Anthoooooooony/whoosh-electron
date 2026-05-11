// 共享 i18n 初始化 —— 由每个 renderer 在 main.tsx 顶部调用一次
//
// 资源放在 src/shared/locales/{zh-CN,en}.json，Vite 直接 import。
//
// 用法：
//   import { initI18n } from '@shared/i18n'
//   import { useTranslation } from 'react-i18next'
//   initI18n()
//   const { t } = useTranslation()
//   <h1>{t('hud.placeholder')}</h1>

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'
import zhCN from '../locales/zh-CN.json'

let inited = false

export function initI18n(initialLocale: 'zh-CN' | 'en' = 'zh-CN'): typeof i18n {
  if (inited) return i18n
  inited = true
  void i18n.use(initReactI18next).init({
    resources: {
      'zh-CN': { translation: zhCN },
      en: { translation: en },
    },
    lng: initialLocale,
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
  })
  return i18n
}

export function setLocale(locale: 'zh-CN' | 'en'): void {
  void i18n.changeLanguage(locale)
}

export { i18n }
