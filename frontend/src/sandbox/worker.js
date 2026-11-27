export function registerWorker(prepare = undefined) {
  globalThis.addEventListener('message', exerciseHandler(prepare), { once: true });
}

export function exerciseHandler(prepare) {
return async ({ data, ports: [port] }) => {
  const send = port.postMessage.bind(port);
  const stringify = JSON.stringify;
  const slice = Function.call.bind(String.prototype.slice);
  let logs = 0;
  function printable(value) {
    try {
      if (value instanceof Error) return slice(`${value.name}: ${value.message}`, 0, 1200);
      if (typeof value === 'string') return slice(value, 0, 1200);
      const seen = new WeakSet();
      return slice(stringify(value, (_key, item) => {
        if (typeof item === 'bigint') return `${item}n`;
        if (typeof item === 'function') return '[Function]';
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
        }
        return item;
      }) ?? String(value), 0, 1200);
    } catch { return '[Unserializable]'; }
  }
  for (const level of ['log', 'warn', 'error']) globalThis.console[level] = (...args) => {
    if (logs++ < 50) send({ type: 'log', level, text: args.slice(0, 8).map(printable).join(' ').slice(0, 1200) });
  };
  const assert = (condition, message = 'Assertion failed') => { if (!condition) throw Error(message); };
  const assertEqual = (actual, expected, message = 'Values differ') =>
    assert(Object.is(actual, expected) || (typeof actual === 'object' && typeof expected === 'object' && stringify(actual) === stringify(expected)), message);
  try {
    const { code, entryPoint, mode, tests, fixture } = data;
    if (entryPoint && !/^[A-Za-z_$][\w$]*$/.test(entryPoint)) throw Error('Exercise entry point must be a JavaScript identifier');
    let input = fixture;
    try { input = JSON.parse(fixture); } catch { /* A fixture may be plain text. */ }
    const environment = prepare?.(data) ?? {
      args: ['fixture', 'assert', 'assertEqual'], values: [input], code,
      run: entryPoint ? `return await ${entryPoint}(fixture);` : 'return undefined;',
    };
    const [fixtureValue, ...runtimeValues] = environment.values;
    const values = [fixtureValue, assert, assertEqual, ...runtimeValues];
    if (mode === 'run') {
      const execute = new Function(...environment.args, `"use strict";\n${environment.code}\n;return (async () => { ${environment.run} })();`);
      send({ type: 'result', text: printable(await execute(...values)) });
      return;
    }
    const wrappers = tests.map(({ code: testCode }) => `async () => {\n${testCode}\n}`);
    const compile = new Function(...environment.args, `"use strict";\n${environment.code}\n;return [${wrappers.join(',')}];`);
    const cases = compile(...values);
    for (let i = 0; i < cases.length; i++) {
      try {
        await cases[i]();
        send({ type: 'test', index: i, passed: true, text: '' });
      } catch (error) {
        send({ type: 'test', index: i, passed: false, text: printable(error) });
      }
    }
    send({ type: 'result', text: 'Tests finished' });
  } catch (error) { send({ type: 'error', text: printable(error) }); }
};
}

