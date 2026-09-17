# Framework integration

These examples assume an installed package and a bundler. The root entry
registers the element. `/element` exports its class and registration function
without automatic registration. Keep browser registration in client code.

## React 19

```tsx
'use client';
import { useEffect } from 'react';
import type { StarlinerElement } from '@screenjoy/starliner/element';
import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'star-liner': DetailedHTMLProps<HTMLAttributes<StarlinerElement>, StarlinerElement>
        & { seed?: string; mode?: 'cruise' | 'ftl' };
    }
  }
}
export function Scene() {
  useEffect(() => { void import('@screenjoy/starliner'); }, []);
  return <star-liner seed="2026" mode="cruise" style={{ width: '100%', height: 360 }} />;
}
```

Use DOM event listeners for custom events when your framework/version does not
support custom-element events directly. Check the package README for event names
and payloads. In Next or another SSR host, the custom element markup can render
on the server, but load and register its class in the browser.

## Vue 3

Configure Vue's compiler to recognize only the tags you use:

```js
// vite.config.js
import vue from '@vitejs/plugin-vue';
export default {
  plugins: [vue({ template: { compilerOptions: {
    isCustomElement: tag => tag === 'star-liner',
  } } })],
};
```

```vue
<script setup>
import { onMounted } from 'vue';
onMounted(() => { void import('@screenjoy/starliner'); });
</script>
<template>
  <star-liner seed="2026" mode="cruise" style="width: 100%; height: 360px;" />
</template>
```

Style the host's dimensions from the parent. Shadow DOM keeps scene styles
inside the element. Avoid importing all Screenjoys into a page that uses only
one. Preserve a static heading or caption so a decorative scene does not carry
information that disappears when animation or WebGL is unavailable.
