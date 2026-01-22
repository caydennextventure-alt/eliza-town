/**
 * Stub for fast-redact that simply passes through data.
 * Used to avoid bundling issues with Convex's esbuild.
 */

const noop = (o) => o;
noop.restore = noop;

function fastRedact(opts = {}) {
  const serialize = 'serialize' in opts ? (
    opts.serialize === false ? opts.serialize
      : (typeof opts.serialize === 'function' ? opts.serialize : JSON.stringify)
  ) : JSON.stringify;

  const paths = Array.from(new Set(opts.paths || []));
  if (paths.length === 0) return serialize || noop;

  // Stub: skip validation entirely - just return a passthrough
  const redact = serialize === false 
    ? (o) => o  // passthrough when serialize is false
    : (o) => serialize(o);
  
  redact.restore = noop;
  return redact;
}

fastRedact.rx = {};
fastRedact.validator = () => {};

export default fastRedact;
