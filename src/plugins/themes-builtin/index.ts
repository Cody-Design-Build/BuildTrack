import { definePlugin } from '../sdk';
import { BUILTIN_THEMES } from './themes';

export default definePlugin({
  id: 'buildtrack.themes',
  name: 'Built-in themes',
  description: 'BuildTrack, Graphite, Nord, Gruvbox, Catppuccin, Tokyo Night, Rosé Pine and Solarized, each in light and dark.',
  core: true,
  themes: BUILTIN_THEMES,
});
