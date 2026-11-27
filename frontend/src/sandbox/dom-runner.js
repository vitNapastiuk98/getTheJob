import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { transform } from 'sucrase';
import { exerciseHandler } from './worker.js';

globalThis.runDomExercise = exerciseHandler(({ fixture, runtime, code, entryPoint }) => {
  document.body.innerHTML = fixture;
  let root;
  function render(Component, props = {}) {
    const target = document.querySelector('#root') ?? document.body.appendChild(document.createElement('div'));
    if (!root || target !== root.container) {
      root?.instance.unmount();
      root = { instance: createRoot(target), container: target };
    }
    flushSync(() => root.instance.render(React.createElement(Component, props)));
    return target;
  }
  return {
    args: ['fixture', 'assert', 'assertEqual', 'React', 'render'],
    values: [fixture, React, render],
    code: runtime === 'react' ? transform(code, { transforms: ['jsx'], jsxRuntime: 'classic', production: true }).code : code,
    run: runtime === 'react'
      ? `render(${entryPoint}); return document.body.innerHTML;`
      : `const result = await ${entryPoint}(fixture); return result === undefined ? document.body.innerHTML : result;`,
  };
});
