// Minimal offline style so tests never depend on tiles.openfreemap.org.
export const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef' } }],
};
