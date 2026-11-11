// Globe mode keeps the panels and the bottom time bar. Sky AR replaces that
// chrome with its own HUD so the two layers do not cover each other.

export function trackerChrome(mode) {
  switch (mode) {
    case 'globe':
      return {
        skyAr: false,
        timeBar: true,
        panels: true,
        orbitEnabled: true,
      };
    case 'sky-ar':
      return {
        skyAr: true,
        timeBar: false,
        panels: false,
        orbitEnabled: true,
      };
    default: {
      const unknown = mode;
      throw new Error(`Unknown tracker mode: ${String(unknown)}`);
    }
  }
}

export function nextTrackerMode(mode) {
  switch (mode) {
    case 'globe':
      return 'sky-ar';
    case 'sky-ar':
      return 'globe';
    default: {
      const unknown = mode;
      throw new Error(`Unknown tracker mode: ${String(unknown)}`);
    }
  }
}
