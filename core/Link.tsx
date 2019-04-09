import * as React from 'react'
import { RouterContext } from './RouterContext'
import { router } from './router'
import { LinkProps } from 'index.d'
import path2Regexp from 'path-to-regexp'

const Link: React.FunctionComponent<LinkProps> = ({
  className, activeClassName, to, onClick, ...restProps
}) => {
  const { location } = React.useContext(RouterContext)
  const matched = path2Regexp(location.pathname).test(to)
  const cls = className + matched ? activeClassName : ''
  const handleClick = (evt: React.MouseEvent) => {
    if (onClick) {
      onClick(evt)
    }
    if (!evt.isDefaultPrevented()) {
      evt.preventDefault()
      router.push(to)
    }
  }
  return (
    <a
      href={to}
      className={cls}
      onClick={handleClick}
      {...restProps}
    />
  )
}

Link.defaultProps = {
  className: '',
  activeClassName: '',
}

export default Link