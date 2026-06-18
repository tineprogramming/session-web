import React from 'react'
import i18next from 'i18next'
import Backend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

export const I18nLoader = React.lazy(async () => {
  await i18next
    .use(initReactI18next)
    .use(Backend)
    .init({
      lng: navigator.language || 'en',
      fallbackLng: 'en',
      backend: {
        // Respect the configured base path so locales resolve under a sub-path deploy.
        loadPath: import.meta.env.BASE_URL + 'locales/{{lng}}/{{ns}}.json',
      },
      defaultNS: 'common'
    })

  return {
    default: ({ children }: React.PropsWithChildren) => children
  }
})