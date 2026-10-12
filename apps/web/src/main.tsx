import { render } from 'preact';
import { App } from './app/App';
import { startEngine } from './state/engine';
// Keep this after the App import: export.css (reached through App) must precede styles.css.
import './styles.css';

startEngine();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
