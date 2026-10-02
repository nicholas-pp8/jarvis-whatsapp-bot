import config from '../config/config.js';

// libsignal prints whole session objects (including key material) with console.info; drop them.
for (const m of ['info', 'log', 'warn']) {
  const orig = console[m].bind(console);
  console[m] = (...a) => {
    if (typeof a[0] === 'string' && /^(Closing|Removing|Opening|Migrating)\b.*session|^Session already|^Closing open session/i.test(a[0])) return;
    orig(...a);
  };
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

// Strip things that look like secrets before anything is printed.
function redact(text) {
  return String(text)
    .replace(/(password|passwd|token|secret|cookie|authorization|apikey|api_key)(["'\s:=]+)[^\s"',}]+/gi, '$1$2[redacted]')
    .replace(/(\d{1,3})\d{5,}(\d{3})/g, '$1*****$2'); // phone-like numbers
}

function write(level, args) {
  if (LEVELS[level] < threshold) return;
  const msg = args
    .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${redact(msg)}`;
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

const errorListeners=new Set();
export const onError=fn=>errorListeners.add(fn);
const logger = {
  debug: (...a) => write('debug', a),
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => {write('error', a);for(const fn of errorListeners)try{fn();}catch{}},
  redact,
};

export default logger;
