import { definePlugin } from '../sdk';
import { omarchyTheme } from '../../theming/omarchy';
import { OMARCHY_THEMES } from './themes';

export default definePlugin({
  id: 'buildtrack.themes.omarchy',
  name: 'Omarchy themes',
  description: 'The Omarchy desktop themes (Kanagawa, Everforest, Matte Black, Osaka Jade and more), set in JetBrains Mono. Most are dark only.',
  author: 'Colours from Omarchy (MIT)',
  themes: OMARCHY_THEMES.map((t) => omarchyTheme(t.toml, t.id, t.name)),
});
