// if (import.meta.env.DEV) {
//   // @ts-ignore
//   await import('preact/debug')
// }

import { render } from 'preact'
import { App } from './App'
import './index.css'

render(<App />, document.getElementById('app')!)
