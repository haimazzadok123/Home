// Bundles Liveline (a React chart) for the plain-JavaScript dashboard in public/dashboard/.
// Build with `npm run build:dashboard`; the output is committed as public/dashboard/vendor/liveline.js.
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Liveline } from 'liveline'

// Mounts a chart into `el` and returns { update(props), unmount() }.
window.mountLiveline = (el, initialProps) => {
  const root = createRoot(el)
  let props = initialProps
  const render = () => root.render(createElement(Liveline, props))
  render()
  return {
    update(next) {
      props = { ...props, ...next }
      render()
    },
    unmount() {
      root.unmount()
    },
  }
}
