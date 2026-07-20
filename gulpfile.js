const { src, dest } = require('gulp');
function buildIcons() {
  return src('{nodes,credentials}/**/*.{png,svg}', { base: '.' }).pipe(dest('dist'));
}
exports['build:icons'] = buildIcons;
