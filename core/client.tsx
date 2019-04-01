import * as React from 'react'
import { hydrate } from 'react-dom'
import { RouterContext } from './RouterContext'
import { RenderOptions, GlobalAppData } from 'index.d'
import Router from './Router'
import DefaultError from './Error'
import Link from './Link'

export function render(opts: RenderOptions) {
  const AppContainer = opts.AppContainer || React.Fragment
  const routes = opts.routes
  const pathname = window.location.pathname
  const str = decodeURIComponent(window.__APP_DATA__)
  const appData = JSON.parse(str) as GlobalAppData
  let app
  if (appData.error) {
    const Error = opts.Error || DefaultError
    app = <Error error={appData.error} />
  } else {
    app = (
      <Router
        location={pathname}
        routes={routes}
        AppContainer={AppContainer}
        pageProps={appData.pageProps}
      />
    )
  }
  hydrate(app, document.querySelector(opts.container))
}

export { Router, Link, RouterContext }
export * from 'history'