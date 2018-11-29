
// https://marketplace.visualstudio.com/items?itemName=boyswan.glsl-literal
export const glsl = f => f;

export function fill(size, fn) {
  return [...Array(size)].map((undef, i) => fn(i));
};

export function flatten(array, result = []) {
  for (let i = 0, n = array.length; i < n; i++) {
    const item = array[i];
    (Array.isArray(item) || item instanceof Float32Array) ? flatten(item, result) : result.push(item);
  }
  return result;
};

export function random(min, max) {

  if(arguments.length == 0) {
    return Math.random();
  }

  if(Array.isArray(min)) {
    return min[ Math.floor(Math.random() * min.length) ];
  }

  if(typeof min == 'undefined') min = 1;
  if(typeof max == 'undefined') max = min || 1, min = 0;

  return min + Math.random() * (max - min);
};