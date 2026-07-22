const { src, dest } = require('gulp');
// Copy icons and codex metadata (*.node.json) that tsc does not emit.
function buildIcons() {
  return src('{nodes,credentials}/**/*.{png,svg,node.json}', { base: '.' }).pipe(dest('dist'));
}
exports['build:icons'] = buildIcons;
