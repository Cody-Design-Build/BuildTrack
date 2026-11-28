import * as Icons from './kit-icons';

/** The kit name of a menu icon (e.g. 'Hammer'), so a plugin's menu can be stored without its code. */
export const iconName = (icon: unknown) => Object.entries(Icons).find(([, c]) => c === icon)?.[0];
